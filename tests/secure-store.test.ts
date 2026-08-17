import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// «Запомнить меня» на оформлении хранит ФИО, телефон и адрес на устройстве.
// Проверяем ровно то, ради чего эта проверка и нужна: данные не живут вечно,
// а протухшие не подставляются следующему человеку за тем же компьютером.
//
// Web Crypto и IndexedDB в vitest-окружении node нет, поэтому подменяем их
// простыми заглушками: интересует логика срока годности, а не сам AES.

const store = new Map<string, string>();
let idbValue: unknown;

function setupBrowser() {
  const fakeKey = { type: "secret" } as unknown as CryptoKey;

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });

  // Шифрование заменяем обратимой упаковкой: содержимое здесь не проверяется.
  vi.stubGlobal("window", {
    crypto: {
      getRandomValues: (a: Uint8Array) => a.fill(7),
      subtle: {
        generateKey: async () => fakeKey,
        encrypt: async (_alg: unknown, _key: unknown, data: BufferSource) =>
          (data as Uint8Array).buffer,
        decrypt: async (_alg: unknown, _key: unknown, data: BufferSource) =>
          (data as Uint8Array).buffer,
      },
    },
  });

  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const r: Record<string, unknown> = { result: idbValue };
                queueMicrotask(() => (r.onsuccess as () => void)?.());
                return r;
              },
              put: (v: unknown) => {
                idbValue = v;
              },
            }),
            oncomplete: null,
          }),
          createObjectStore: () => {},
        },
      };
      queueMicrotask(() => (req.onsuccess as () => void)?.());
      return req;
    },
  });
  idbValue = fakeKey;
}

describe("хранилище «Запомнить меня»", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
    setupBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("сохранённые данные читаются обратно", async () => {
    const { secureSet, secureGet } = await import("@/lib/secure-store");
    await secureSet("k", { phone: "+79000000000" });
    expect(await secureGet("k")).toEqual({ phone: "+79000000000" });
  });

  it("через 30 дней данные протухают и стираются", async () => {
    vi.useFakeTimers();
    const { secureSet, secureGet } = await import("@/lib/secure-store");
    await secureSet("k", { phone: "+79000000000" });

    vi.advanceTimersByTime(29 * 24 * 60 * 60 * 1000);
    expect(await secureGet("k")).not.toBeNull();

    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    expect(await secureGet("k")).toBeNull();
    // Не просто «не отдали», а удалили: устройство может быть общим.
    expect(store.has("k")).toBe(false);
  });

  it("записи прежнего формата (без отметки времени) не принимаются", async () => {
    const { secureGet } = await import("@/lib/secure-store");
    // Старый формат — сам объект без savedAt. Срок его хранения неизвестен,
    // поэтому считаем просроченным.
    const legacy = new TextEncoder().encode(JSON.stringify({ phone: "+7900" }));
    store.set(
      "k",
      JSON.stringify({
        iv: Buffer.from(new Uint8Array(12).fill(7)).toString("base64"),
        data: Buffer.from(legacy).toString("base64"),
      })
    );
    expect(await secureGet("k")).toBeNull();
    expect(store.has("k")).toBe(false);
  });
});
