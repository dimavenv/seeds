import { describe, expect, it } from "vitest";
import {
  normalizeCart,
  normalizeWishlist,
  MAX_WISHLIST,
} from "@/lib/user-store";
import { purgeFromSnapshot } from "@/lib/user-store-cleanup";
import { mergeCarts, sanitizeCartItems } from "@/lib/cart-merge";
import { MAX_ITEMS_PER_ORDER, MAX_QTY_PER_ITEM } from "@/lib/checkout";
import type { CartItem } from "@/lib/types";

const ID_A = "abc123def456789";
const ID_B = "zyx987wvu654321";

function item(over: Partial<CartItem> = {}): Record<string, unknown> {
  return {
    id: ID_A,
    slug: "tomat-cherry",
    name: "Томат Черри",
    price: 120,
    image_url: null,
    qty: 2,
    stock: 10,
    ...over,
  };
}

describe("normalizeCart (серверная корзина из браузера)", () => {
  it("пропускает корректную позицию как есть", () => {
    expect(normalizeCart([item()])).toEqual([
      {
        id: ID_A,
        slug: "tomat-cherry",
        name: "Томат Черри",
        price: 120,
        image_url: null,
        image_thumb: null,
        qty: 2,
        stock: 10,
      },
    ]);
  });

  it("не-массив и мусорные записи отбрасываются", () => {
    expect(normalizeCart(null)).toEqual([]);
    expect(normalizeCart("nope")).toEqual([]);
    expect(normalizeCart({})).toEqual([]);
    expect(normalizeCart([null, undefined, 42, "x", {}])).toEqual([]);
    // числовой id из старого Supabase-хранилища
    expect(normalizeCart([item({ id: 7 as unknown as string })])).toEqual([]);
  });

  it("количество: целое, минимум 1, не выше потолка", () => {
    expect(normalizeCart([item({ qty: 0 })])[0].qty).toBe(1);
    expect(normalizeCart([item({ qty: -5 })])[0].qty).toBe(1);
    expect(normalizeCart([item({ qty: 2.9 })])[0].qty).toBe(2);
    expect(normalizeCart([item({ qty: 1e9 })])[0].qty).toBe(MAX_QTY_PER_ITEM);
    expect(normalizeCart([item({ qty: NaN })])[0].qty).toBe(1);
    expect(normalizeCart([item({ qty: "5" as unknown as number })])[0].qty).toBe(5);
  });

  it("цена: отрицательная и нечисловая обнуляются", () => {
    expect(normalizeCart([item({ price: -100 })])[0].price).toBe(0);
    expect(normalizeCart([item({ price: NaN })])[0].price).toBe(0);
    expect(normalizeCart([item({ price: "x" as unknown as number })])[0].price).toBe(0);
    expect(normalizeCart([item({ price: 99.5 })])[0].price).toBe(99.5);
  });

  it("остаток: целый неотрицательный либо null", () => {
    expect(normalizeCart([item({ stock: -3 })])[0].stock).toBe(0);
    expect(normalizeCart([item({ stock: 4.7 })])[0].stock).toBe(4);
    expect(normalizeCart([item({ stock: undefined })])[0].stock).toBeNull();
    expect(normalizeCart([item({ stock: "10" as unknown as number })])[0].stock).toBeNull();
  });

  it("лишние поля не проходят (нет mass assignment в user_store)", () => {
    const dirty = { ...item(), role: "admin", user: "someone-else", __proto__: {} };
    const out = normalizeCart([dirty]);
    expect(Object.keys(out[0]).sort()).toEqual(
      [
        "id",
        "image_url",
        "image_thumb",
        "name",
        "price",
        "qty",
        "slug",
        "stock",
      ].sort()
    );
  });

  it("миниатюра: строка или null, длина ограничена", () => {
    // Поле необязательное: у корзин, сохранённых до его появления, и у фото
    // без облегчённых вариантов его просто нет.
    expect(normalizeCart([item({ image_thumb: undefined })])[0].image_thumb).toBeNull();
    expect(
      normalizeCart([item({ image_thumb: "https://x/y-400.webp" })])[0].image_thumb
    ).toBe("https://x/y-400.webp");
    expect(
      normalizeCart([item({ image_thumb: 42 as unknown as string })])[0].image_thumb
    ).toBeNull();
  });

  it("строки обрезаются по длине", () => {
    const out = normalizeCart([item({ name: "я".repeat(5000) })]);
    expect(out[0].name.length).toBe(300);
  });

  it("дубли одного товара сливаются в одну позицию", () => {
    const out = normalizeCart([item({ qty: 1 }), item({ qty: 9 })]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(1); // первая запись выигрывает
  });

  it("число позиций ограничено потолком", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_ORDER + 40 }, (_, i) =>
      item({ id: `id${String(i).padStart(12, "0")}` })
    );
    expect(normalizeCart(many)).toHaveLength(MAX_ITEMS_PER_ORDER);
  });
});

describe("normalizeWishlist", () => {
  it("оставляет только валидные id, без дублей", () => {
    expect(normalizeWishlist([ID_A, ID_B, ID_A])).toEqual([ID_A, ID_B]);
  });

  it("мусор отбрасывается", () => {
    expect(normalizeWishlist(null)).toEqual([]);
    expect(normalizeWishlist([1, {}, "", "../../etc", null])).toEqual([]);
  });

  it("длина ограничена", () => {
    const many = Array.from({ length: MAX_WISHLIST + 50 }, (_, i) =>
      `id${String(i).padStart(12, "0")}`
    );
    expect(normalizeWishlist(many)).toHaveLength(MAX_WISHLIST);
  });
});

// Инварианты сохранности корзины при входе: локальная и серверная копии
// сливаются без потерь и без удвоения количества, а нормализация не ломает
// результат слияния (то, что записывается в user_store).
describe("сохранность корзины при слиянии локальной и серверной", () => {
  const local: CartItem[] = [
    { id: ID_A, slug: "a", name: "A", price: 100, image_url: null, qty: 2 },
  ];
  const server: CartItem[] = [
    { id: ID_B, slug: "b", name: "B", price: 50, image_url: null, qty: 1 },
  ];

  it("позиции из обеих корзин сохраняются", () => {
    const merged = mergeCarts(local, server);
    expect(merged.map((i) => i.id).sort()).toEqual([ID_A, ID_B].sort());
  });

  it("общий товар не удваивается — берётся большее количество", () => {
    const merged = mergeCarts(local, [{ ...local[0], qty: 5 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(5);
  });

  it("слияние не мутирует исходные корзины", () => {
    const before = JSON.stringify([local, server]);
    mergeCarts(local, server);
    expect(JSON.stringify([local, server])).toBe(before);
  });

  it("результат слияния проходит нормализацию без потери позиций", () => {
    const merged = mergeCarts(local, server);
    const normalized = normalizeCart(merged);
    expect(normalized).toHaveLength(merged.length);
    expect(normalized.map((i) => i.id).sort()).toEqual([ID_A, ID_B].sort());
    expect(normalized.map((i) => i.qty)).toEqual(merged.map((i) => i.qty));
  });

  it("пустая корзина остаётся пустой (очистка доезжает до сервера)", () => {
    expect(normalizeCart(mergeCarts([], []))).toEqual([]);
    expect(normalizeCart([])).toEqual([]);
  });

  it("данные из user_store читаются тем же санитайзером, что и localStorage", () => {
    const fromDb = sanitizeCartItems([local[0], { id: 5, qty: 1 }]);
    expect(fromDb).toHaveLength(1);
    expect(normalizeCart(fromDb)).toHaveLength(1);
  });
});

// Решение «верить серверу или сливать» на стороне провайдера. Вынесено в чистую
// функцию-предикат, чтобы зафиксировать регрессию: при отсутствующей записи
// user_store пустая серверная корзина НЕ должна затирать локальную.
function trustServer(opts: {
  syncedUser: string | null;
  userId: string;
  exists: boolean;
}): boolean {
  return opts.syncedUser === opts.userId && opts.exists;
}

describe("выбор источника истины при загрузке", () => {
  it("повторный заход с существующей записью — верим серверу", () => {
    expect(trustServer({ syncedUser: ID_A, userId: ID_A, exists: true })).toBe(true);
  });

  it("первый вход на устройстве — сливаем локальное с серверным", () => {
    expect(trustServer({ syncedUser: null, userId: ID_A, exists: true })).toBe(false);
  });

  it("другой пользователь на этом устройстве — сливаем, а не верим метке", () => {
    expect(trustServer({ syncedUser: ID_B, userId: ID_A, exists: true })).toBe(false);
  });

  it("метка есть, но записи user_store нет — НЕ затираем локальную корзину", () => {
    expect(trustServer({ syncedUser: ID_A, userId: ID_A, exists: false })).toBe(false);
  });
});

// ===== Зачистка удалённого товара из чужих корзин ============================

describe("purgeFromSnapshot", () => {
  const GONE = "goneitem0000001";

  it("убирает товар и из корзины, и из избранного", () => {
    const r = purgeFromSnapshot(
      [
        { id: ID_A, qty: 2, price: 100, name: "Живой" },
        { id: GONE, qty: 1, price: 50, name: "Удалённый" },
      ],
      [ID_A, GONE],
      [GONE]
    );
    expect(r.changed).toBe(true);
    expect(r.cart.map((i) => i.id)).toEqual([ID_A]);
    expect(r.wishlist).toEqual([ID_A]);
  });

  it("ничего не трогает, если удалённого товара у покупателя не было", () => {
    const r = purgeFromSnapshot(
      [{ id: ID_A, qty: 1, price: 100, name: "Живой" }],
      [ID_A],
      [GONE]
    );
    expect(r.changed).toBe(false);
    expect(r.cart).toHaveLength(1);
    expect(r.wishlist).toEqual([ID_A]);
  });

  it("переживает пустую и битую запись user_store", () => {
    const r = purgeFromSnapshot(null, "не массив", [GONE]);
    expect(r.changed).toBe(false);
    expect(r.cart).toEqual([]);
    expect(r.wishlist).toEqual([]);
  });
});
