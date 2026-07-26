// Юнит-тесты оркестрации reserveStock/releaseStock на фейковом клиенте:
// маппинг ошибок батча (400 → conflict, 403 → фолбэк) и поведение фолбэка.
// Настоящая атомарность проверяется интеграционно в stock-race.test.ts.
import { describe, expect, it, vi } from "vitest";
import type PocketBase from "pocketbase";
import { releaseStock, reserveStock } from "@/lib/stock";

type Call = { id: string; data: Record<string, unknown> };

// Фейковый PocketBase: батч либо кидает заданную ошибку, либо применяет
// изменения к in-memory остаткам; фолбэк getOne/update тоже работает.
function fakePb(opts: { stocks: Record<string, number>; batchError?: { status: number } }) {
  const batchCalls: Call[] = [];
  const fallbackUpdates: Call[] = [];
  const pb = {
    createBatch() {
      const queued: Call[] = [];
      return {
        collection(name: string) {
          if (name !== "products") throw new Error(`неожиданная коллекция ${name}`);
          return {
            update(id: string, data: Record<string, unknown>) {
              queued.push({ id, data });
            },
          };
        },
        async send() {
          batchCalls.push(...queued);
          if (opts.batchError) {
            const err = new Error("batch failed") as Error & { status: number };
            err.status = opts.batchError.status;
            throw err;
          }
          for (const c of queued) {
            const dec = Number(c.data["stock-"] ?? 0);
            const inc = Number(c.data["stock+"] ?? 0);
            opts.stocks[c.id] = (opts.stocks[c.id] ?? 0) - dec + inc;
          }
          return queued.map(() => ({}));
        },
      };
    },
    collection(name: string) {
      if (name !== "products") throw new Error(`неожиданная коллекция ${name}`);
      return {
        async getOne(id: string) {
          if (!(id in opts.stocks)) throw new Error("not found");
          return { id, stock: opts.stocks[id] };
        },
        async update(id: string, data: Record<string, unknown>) {
          fallbackUpdates.push({ id, data });
          opts.stocks[id] = Number(data.stock);
          return { id, ...data };
        },
      };
    },
  };
  return { pb: pb as unknown as PocketBase, batchCalls, fallbackUpdates };
}

describe("reserveStock", () => {
  it("успешный батч списывает и возвращает reserved", async () => {
    const f = fakePb({ stocks: { a: 5 } });
    expect(await reserveStock(f.pb, [{ productId: "a", qty: 2 }])).toBe("reserved");
    expect(f.batchCalls).toEqual([{ id: "a", data: { "stock-": 2 } }]);
    expect(f.fallbackUpdates).toEqual([]); // фолбэк не трогался
  });

  it("400 от батча = конфликт остатков, ничего не списано и нет фолбэка", async () => {
    const f = fakePb({ stocks: { a: 1 }, batchError: { status: 400 } });
    expect(await reserveStock(f.pb, [{ productId: "a", qty: 2 }])).toBe("conflict");
    expect(f.fallbackUpdates).toEqual([]);
  });

  it("403 (Batch API выключен) — неатомарный фолбэк, поведение не ломается", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const f = fakePb({ stocks: { a: 5, b: 2 }, batchError: { status: 403 } });
      const out = await reserveStock(f.pb, [
        { productId: "a", qty: 2 },
        { productId: "b", qty: 1 },
      ]);
      expect(out).toBe("reserved");
      // списание прошло через getOne/update
      expect(f.fallbackUpdates).toEqual([
        { id: "a", data: { stock: 3 } },
        { id: "b", data: { stock: 1 } },
      ]);
      expect(errSpy).toHaveBeenCalled(); // громкое предупреждение в лог
    } finally {
      errSpy.mockRestore();
    }
  });

  it("пустой список и qty <= 0 — reserved без обращений к базе", async () => {
    const f = fakePb({ stocks: {} });
    expect(await reserveStock(f.pb, [])).toBe("reserved");
    expect(await reserveStock(f.pb, [{ productId: "a", qty: 0 }])).toBe("reserved");
    expect(f.batchCalls).toEqual([]);
  });
});

describe("releaseStock", () => {
  it("успешный батч возвращает резерв", async () => {
    const f = fakePb({ stocks: { a: 0 } });
    await releaseStock(f.pb, [{ productId: "a", qty: 3 }]);
    expect(f.batchCalls).toEqual([{ id: "a", data: { "stock+": 3 } }]);
  });

  it("при ошибке батча — фолбэк-инкремент", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const f = fakePb({ stocks: { a: 1 }, batchError: { status: 403 } });
      await releaseStock(f.pb, [{ productId: "a", qty: 2 }]);
      expect(f.fallbackUpdates).toEqual([{ id: "a", data: { stock: 3 } }]);
    } finally {
      errSpy.mockRestore();
    }
  });
});
