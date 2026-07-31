// Интеграционные тесты промокода «один раз на аккаунт» против ЖИВОГО
// PocketBase: проверяем не наш расчёт, а то, ради чего он затевался —
// уникальный индекс (user, code) в коллекции promo_uses, который физически не
// даёт применить код дважды даже при одновременных запросах.
//
// Нужен бинарник: node scripts/fetch-pocketbase.mjs (кладётся в .pb/, в git не
// попадает). Без бинарника набор пропускается — остальные тесты это не
// блокирует. Устройство и запуск — как в tests/stock-race.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PocketBase from "pocketbase";
import {
  attachPromoUseToOrder,
  isPromoUsed,
  releasePromoUse,
  releasePromoUseByOrder,
  reservePromoUse,
} from "@/lib/promo-server";

const ROOT = path.resolve(__dirname, "..");
const EMAIL = "admin@test.local";
const PASS = "pass1234567";
const CODE = "УРОЖАЙ";

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
    "[promo-race] Бинарник PocketBase не найден — интеграционные тесты пропущены. " +
      "Скачайте его: node scripts/fetch-pocketbase.mjs"
  );
}

const PORT = 20000 + Math.floor(Math.random() * 2000);
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

describe.skipIf(!BIN)("промокод один раз на аккаунт: живой PocketBase", () => {
  let proc: ChildProcess | null = null;
  let dataDir = "";
  let pb: PocketBase;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-promo-"));
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

    // Импортируем НАСТОЯЩУЮ схему репозитория: тест заодно гарантирует, что в
    // pb_schema.json действительно есть уникальный индекс (user, code) —
    // без него «один раз на аккаунт» держалось бы только на проверке в коде.
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, "pocketbase", "pb_schema.json"), "utf8")
    );
    const imp = await fetch(`${URL}/api/collections/import`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: pb.authStore.token },
      body: JSON.stringify({ collections: schema, deleteMissing: false }),
    });
    if (!imp.ok) throw new Error(`import: ${imp.status} ${await imp.text()}`);
  }, 60_000);

  afterAll(() => {
    proc?.kill();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // Отдельный клиент на каждое «оформление» — как отдельный запрос.
  function client(): PocketBase {
    const c = new PocketBase(URL);
    c.autoCancellation(false);
    c.authStore.save(pb.authStore.token, pb.authStore.record);
    return c;
  }

  let seq = 0;
  async function createUser(): Promise<string> {
    const n = ++seq;
    const pass = "buyer-password-1";
    const rec = await pb.collection("users").create({
      email: `buyer-${n}-${Date.now()}@test.local`,
      password: pass,
      passwordConfirm: pass,
      verified: true,
      role: "customer",
    });
    return rec.id;
  }

  async function createOrder(userId: string): Promise<string> {
    const rec = await pb.collection("orders").create({
      number: 1000 + ++seq,
      customer_name: "Тест Тестов",
      phone: "+79990000000",
      address: "Пункт выдачи Ozon: Москва",
      status: "new",
      payment_status: "pending",
      total: 900,
      discount: 100,
      promo_code: CODE,
      user: userId,
      placed_at: new Date().toISOString(),
    });
    return rec.id;
  }

  it("второе применение тем же аккаунтом отбивается базой", async () => {
    const user = await createUser();
    const first = await reservePromoUse(client(), user, CODE);
    expect(first.status).toBe("reserved");
    const second = await reservePromoUse(client(), user, CODE);
    expect(second.status).toBe("used");
  });

  it("два одновременных оформления — скидку получает ровно одно", async () => {
    const user = await createUser();
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => reservePromoUse(client(), user, CODE))
    );
    expect(outcomes.filter((o) => o.status === "reserved")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "used")).toHaveLength(4);
  });

  it("код одного аккаунта не мешает другому", async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await reservePromoUse(client(), a, CODE)).status).toBe("reserved");
    expect((await reservePromoUse(client(), b, CODE)).status).toBe("reserved");
  });

  it("откат оформления возвращает промокод покупателю", async () => {
    const user = await createUser();
    const reserved = await reservePromoUse(client(), user, CODE);
    expect(reserved.status).toBe("reserved");
    expect(await isPromoUsed(client(), user, CODE)).toBe(true);

    if (reserved.status !== "reserved") return;
    await releasePromoUse(client(), reserved.id);
    expect(await isPromoUsed(client(), user, CODE)).toBe(false);
    // Код снова применим.
    expect((await reservePromoUse(client(), user, CODE)).status).toBe("reserved");
  });

  it("удаление неоплаченного заказа возвращает промокод", async () => {
    const user = await createUser();
    const reserved = await reservePromoUse(client(), user, CODE);
    if (reserved.status !== "reserved") throw new Error("резерв не прошёл");
    const orderId = await createOrder(user);
    await attachPromoUseToOrder(client(), reserved.id, orderId);

    await releasePromoUseByOrder(client(), orderId);
    expect(await isPromoUsed(client(), user, CODE)).toBe(false);
  });

  it("возврат по чужому заказу ничего не трогает", async () => {
    const user = await createUser();
    const reserved = await reservePromoUse(client(), user, CODE);
    if (reserved.status !== "reserved") throw new Error("резерв не прошёл");
    const orderId = await createOrder(user);
    await attachPromoUseToOrder(client(), reserved.id, orderId);

    const otherOrder = await createOrder(await createUser());
    await releasePromoUseByOrder(client(), otherOrder);
    expect(await isPromoUsed(client(), user, CODE)).toBe(true);
  });
});
