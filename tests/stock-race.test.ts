// Интеграционные тесты атомарного списания остатков против ЖИВОГО PocketBase.
//
// Нужен бинарник: node scripts/fetch-pocketbase.mjs (кладётся в .pb/, в git
// не попадает). Без бинарника весь набор пропускается с предупреждением —
// остальные тесты это не блокирует.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PocketBase from "pocketbase";
import { releaseStock, reserveStock } from "@/lib/stock";

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
});
