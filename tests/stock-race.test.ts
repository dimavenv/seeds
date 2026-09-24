// Интеграционные тесты атомарного списания остатков против ЖИВОГО PocketBase.
//
// Нужен бинарник: node scripts/fetch-pocketbase.mjs (кладётся в .pb/, в git
// не попадает). Без бинарника весь набор пропускается с предупреждением —
// остальные тесты это не блокирует.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PocketBase from "pocketbase";
import { releaseStock, reserveStock } from "@/lib/stock";
import { createOrderWithItems, markOrderPaid } from "@/lib/order-flow";
import { applyNewPassword, createPasswordLink, inspectPasswordToken } from "@/lib/password-reset";
import { encryptField } from "@/lib/crypto";
import { sendMail } from "@/lib/email";
import { repairPaidAccounts } from "@/lib/auto-account";
import { retryAccountWelcomes } from "@/lib/account-welcome";

vi.mock("@/lib/email", async (original) => ({
  ...await original<typeof import("@/lib/email")>(),
  isMailConfigured: () => true,
  sendMail: vi.fn(async () => true),
}));

const ROOT = path.resolve(__dirname, "..");
const EMAIL = "admin@test.local";
const PASS = "pass1234567";

function findPbBinary(): string | null {
  if (process.env.PB_BINARY && fs.existsSync(process.env.PB_BINARY)) {
    return process.env.PB_BINARY;
  }
  const bin = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
  for (const pkg of [
    "pocketbase-server-linux-x64",
    "pocketbase-server-linux-arm64",
    "pocketbase-server-darwin-arm64",
    "pocketbase-server-darwin-x64",
    "pocketbase-server-win32-x64",
  ]) {
    const p = path.join(ROOT, ".pb", "node_modules", pkg, "bin", bin);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const BIN = findPbBinary();
if (!BIN) {
  console.warn(
    "[stock-race] Бинарник PocketBase не найден — интеграционные тесты пропущены. " +
      "Скачайте его: node scripts/fetch-pocketbase.mjs"
  );
}

const PORT = 18000 + Math.floor(Math.random() * 2000);
const URL = `http://127.0.0.1:${PORT}`;

async function waitForHealth(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${URL}/api/health`);
      if (res.ok) return;
    } catch {
      /* ещё поднимается */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("PocketBase не поднялся за отведённое время");
}

async function setBatchEnabled(token: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${URL}/api/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({
      batch: { enabled, maxRequests: 200, timeout: 10, maxBodySize: 0 },
    }),
  });
  if (!res.ok) throw new Error(`settings: ${res.status} ${await res.text()}`);
}

describe.skipIf(!BIN)("гонка остатков: живой PocketBase", () => {
  let proc: ChildProcess | null = null;
  let dataDir = "";
  let pb: PocketBase;

  beforeAll(async () => {
    vi.stubEnv("SMTP_HOST", ""); // изолированные тесты не отправляют реальные письма
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-race-"));
    const up = spawnSync(BIN!, ["superuser", "upsert", EMAIL, PASS, "--dir", dataDir]);
    if (up.status !== 0) {
      throw new Error(`superuser upsert: ${up.stderr?.toString() || up.status}`);
    }
    proc = spawn(BIN!, ["serve", "--http", `127.0.0.1:${PORT}`, "--dir", dataDir], {
      stdio: "ignore",
    });
    await waitForHealth();

    pb = new PocketBase(URL);
    pb.autoCancellation(false);
    await pb.collection("_superusers").authWithPassword(EMAIL, PASS);

    // Импортируем НАСТОЯЩУЮ схему репозитория: тест заодно гарантирует, что
    // в pb_schema.json действительно задан min: 0 у products.stock — без
    // него атомарность не работает.
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, "pocketbase", "pb_schema.json"), "utf8")
    );
    const imp = await fetch(`${URL}/api/collections/import`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: pb.authStore.token },
      body: JSON.stringify({ collections: schema, deleteMissing: false }),
    });
    if (!imp.ok) throw new Error(`import: ${imp.status} ${await imp.text()}`);

    await setBatchEnabled(pb.authStore.token, true);
  }, 60_000);

  afterAll(() => {
    proc?.kill();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  // Отдельный клиент на «покупателя» — как отдельный запрос оформления.
  function client(): PocketBase {
    const c = new PocketBase(URL);
    c.autoCancellation(false);
    c.authStore.save(pb.authStore.token, pb.authStore.record);
    return c;
  }

  async function createProduct(stock: number): Promise<string> {
    const rec = await pb.collection("products").create({
      name: `Тестовый сорт ${stock}`,
      slug: `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      price: 100,
      stock,
    });
    return rec.id;
  }

  async function stockOf(id: string): Promise<number> {
    return Number((await pb.collection("products").getOne(id)).stock);
  }

  it(
    "10 одновременных заказов при остатке 3 — ровно 3 успеха, остаток 0",
    async () => {
      const id = await createProduct(3);
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () =>
          reserveStock(client(), [{ productId: id, qty: 1 }])
        )
      );
      expect(outcomes.filter((o) => o === "reserved")).toHaveLength(3);
      expect(outcomes.filter((o) => o === "conflict")).toHaveLength(7);
      expect(await stockOf(id)).toBe(0);
    },
    30_000
  );

  it("конфликт по одной позиции откатывает списание всех позиций заказа", async () => {
    const a = await createProduct(5);
    const b = await createProduct(1);
    const out = await reserveStock(client(), [
      { productId: a, qty: 2 },
      { productId: b, qty: 2 }, // больше остатка
    ]);
    expect(out).toBe("conflict");
    // транзакция целиком: a не должен быть списан
    expect(await stockOf(a)).toBe(5);
    expect(await stockOf(b)).toBe(1);
  });

  it("releaseStock возвращает резерв на склад", async () => {
    const id = await createProduct(4);
    expect(await reserveStock(client(), [{ productId: id, qty: 3 }])).toBe("reserved");
    expect(await stockOf(id)).toBe(1);
    await releaseStock(client(), [{ productId: id, qty: 3 }]);
    expect(await stockOf(id)).toBe(4);
  });

  it("списание ровно до нуля проходит (граница min: 0)", async () => {
    const id = await createProduct(2);
    expect(await reserveStock(client(), [{ productId: id, qty: 2 }])).toBe("reserved");
    expect(await stockOf(id)).toBe(0);
  });

  it("при выключенном Batch API работает неатомарный фолбэк, сайт не ломается", async () => {
    await setBatchEnabled(pb.authStore.token, false);
    try {
      const id = await createProduct(2);
      expect(await reserveStock(client(), [{ productId: id, qty: 1 }])).toBe("reserved");
      expect(await stockOf(id)).toBe(1);
      await releaseStock(client(), [{ productId: id, qty: 1 }]);
      expect(await stockOf(id)).toBe(2);
    } finally {
      await setBatchEnabled(pb.authStore.token, true);
    }
  });

  it("reset-ссылка одноразовая, новый пароль входит, старый больше не работает", async () => {
    const email = `reset-${Date.now()}@test.local`;
    const user = await pb.collection("users").create({
      email, password: "old-password", passwordConfirm: "old-password", role: "customer",
    });
    const link = await createPasswordLink(pb, user.id, "reset");
    const raw = new globalThis.URL(link.url).searchParams.get("token")!;
    const results = await Promise.all([
      applyNewPassword(raw, "new-password", client()),
      applyNewPassword(raw, "new-password", client()),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await inspectPasswordToken(raw, pb)).toBeNull();
    const buyer = new PocketBase(URL);
    await expect(buyer.collection("users").authWithPassword(email, "new-password")).resolves.toBeDefined();
    await expect(buyer.collection("users").authWithPassword(email, "old-password")).rejects.toBeDefined();
    const expired = await createPasswordLink(pb, user.id, "reset");
    await pb.collection("password_reset_tokens").update(expired.recordId, {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(await inspectPasswordToken(new globalThis.URL(expired.url).searchParams.get("token")!, pb)).toBeNull();
  });

  it("конкурентные оплаты атомарно фиксируют paid и резерв только один раз", async () => {
    const productId = await createProduct(10);
    const user = await pb.collection("users").create({
      email: `paid-${Date.now()}@test.local`,
      password: "test-password", passwordConfirm: "test-password", role: "customer",
    });
    const invId = 100001;
    const order = await createOrderWithItems(pb, {
      customer_name: "Тестовый покупатель", phone: "+79991112233", email: "test@test.local",
      address: "Тестовый адрес", comment: "", delivery_method: "ozon", delivery_cost: 0,
      promo_code: "", discount: 0, total: 200, user: user.id,
      items: [{ product: productId, name: "Томат", price: 100, qty: 2 }],
    }, { invoiceId: invId, paymentStatus: "failed" });
    const store = await pb.collection("user_store").create({
      user: user.id, cart: [{ id: productId, qty: 2, price: 100, name: "Томат" }], wishlist: [],
    });
    const results = await Promise.all([markOrderPaid(client(), invId), markOrderPaid(client(), invId)]);
    expect(results.filter((result) => result?.alreadyPaid === false)).toHaveLength(1);
    expect((await pb.collection("orders").getOne(order.id)).payment_status).toBe("paid");
    expect(await stockOf(productId)).toBe(8);
    expect((await pb.collection("user_store").getOne(store.id)).cart).toEqual([]);
    await pb.collection("user_store").update(store.id, {
      cart: [{ id: productId, qty: 1, price: 100, name: "Новый товар" }],
    });
    await markOrderPaid(pb, invId);
    expect(await stockOf(productId)).toBe(8);
    expect((await pb.collection("user_store").getOne(store.id)).cart).toHaveLength(1);
  });

  it("гость получает аккаунт после оплаты, повторная покупка сохраняет пароль", async () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32));
    const email = `guest-${Date.now()}@test.local`;
    const payload = {
      customer_name: "Покупатель", phone: encryptField("+79991112233")!, email: encryptField(email)!,
      address: "Адрес", comment: "", delivery_method: "ozon", delivery_cost: 0,
      promo_code: "", discount: 0, total: 100, user: "",
      items: [{ product: await createProduct(10), name: "Томат", price: 100, qty: 1 }],
    };
    const order = await createOrderWithItems(pb, payload, { invoiceId: 100002, paymentStatus: "pending" });
    const users = () => pb.collection("users").getFullList({ filter: pb.filter("email = {:email}", { email }) });
    expect(await users()).toHaveLength(0);
    await markOrderPaid(pb, 100002);
    const [user] = await users();
    expect(user).toBeDefined();
    const welcome = vi.mocked(sendMail).mock.calls.find(([to, subject]) => to === email && subject.includes("логин и пароль"));
    expect(welcome).toBeDefined();
    const password = welcome![2].match(/Пароль: <b>([^<]+)<\/b>/)![1];
    const buyer = new PocketBase(URL);
    await buyer.collection("users").authWithPassword(email, password);
    expect((await buyer.collection("users").getOne(user.id)).welcome_credentials).toBeUndefined();
    await buyer.collection("users").update(user.id, { welcome_credentials: "injected" }).catch(() => {});
    expect((await pb.collection("users").getOne(user.id)).welcome_credentials).toBe("");
    await buyer.collection("users").update(user.id, {
      oldPassword: password, password: "my-password", passwordConfirm: "my-password", auto_password: false,
    });
    expect((await pb.collection("orders").getOne(order.id)).user).toBe(user.id);
    await createOrderWithItems(pb, payload, { invoiceId: 100003, paymentStatus: "pending" });
    await markOrderPaid(pb, 100003);
    await markOrderPaid(pb, 100003);
    expect(await users()).toHaveLength(1);
    expect(vi.mocked(sendMail).mock.calls.filter(([to, subject]) => to === email && subject.includes("логин и пароль"))).toHaveLength(1);
    await expect(new PocketBase(URL).collection("users").authWithPassword(email, "my-password")).resolves.toBeDefined();
  });

  it("восстанавливает старый оплаченный заказ и повторяет письмо после отказа SMTP", async () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32));
    const email = `repair-${Date.now()}@test.local`;
    const order = await createOrderWithItems(pb, {
      customer_name: "Покупатель", phone: encryptField("+79991112233")!, email: encryptField(email)!,
      address: "Адрес", comment: "", delivery_method: "ozon", delivery_cost: 0,
      promo_code: "", discount: 0, total: 100, user: "",
      items: [{ product: await createProduct(10), name: "Томат", price: 100, qty: 1 }],
    }, { invoiceId: 100004, paymentStatus: "paid" });
    vi.mocked(sendMail).mockResolvedValue(false);
    try {
      expect((await repairPaidAccounts(pb)).failed).toBe(1);
      const linked = await pb.collection("orders").getOne(order.id);
      expect(linked.user).toBeTruthy();
      const user = await pb.collection("users").getOne(linked.user);
      expect(user.welcome_credentials).toBeTruthy();
      vi.mocked(sendMail).mockResolvedValue(true);
      await markOrderPaid(pb, 100004); // Повторное уведомление должно доставить доступ.
      const welcome = vi.mocked(sendMail).mock.calls.filter(([to]) => to === email).at(-1)!;
      const password = welcome[2].match(/Пароль: <b>([^<]+)<\/b>/)![1];
      expect(user.welcome_credentials).not.toContain(password);
      await expect(new PocketBase(URL).collection("users").authWithPassword(email, password)).resolves.toBeDefined();
      expect((await pb.collection("users").getOne(user.id)).welcome_credentials).toBe("");
      expect(await retryAccountWelcomes(pb)).toEqual({ sent: 0, failed: 0 });
    } finally {
      vi.mocked(sendMail).mockResolvedValue(true);
    }
  });

  it("сбой смены пароля не расходует ссылку; новая ссылка отменяет старую", async () => {
    const user = await pb.collection("users").create({
      email: `rollback-${Date.now()}@test.local`, password: "old-password", passwordConfirm: "old-password",
    });
    const first = await createPasswordLink(pb, user.id, "reset");
    const second = await createPasswordLink(pb, user.id, "reset");
    const tokenOf = (url: string) => new globalThis.URL(url).searchParams.get("token")!;
    expect(await inspectPasswordToken(tokenOf(first.url), pb)).toBeNull();
    expect(await applyNewPassword(tokenOf(second.url), "short", pb)).toMatchObject({ ok: false });
    expect(await inspectPasswordToken(tokenOf(second.url), pb)).not.toBeNull();
    expect(await applyNewPassword(tokenOf(second.url), "valid-password", pb)).toMatchObject({ ok: true });
  });
});
