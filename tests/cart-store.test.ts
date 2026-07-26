import { describe, expect, it } from "vitest";
import { cartReducer, toggleWishlist, type CartAction } from "@/lib/cart-store";
import { MAX_QTY_PER_ITEM } from "@/lib/checkout";
import type { CartItem, Product } from "@/lib/types";

// Товар с нужными для корзины полями (остальное — заглушки).
function product(over: Partial<Product> & { id: string }): Product {
  return {
    slug: over.id,
    name: `Товар ${over.id}`,
    description: null,
    price: 100,
    category_id: null,
    image_url: null,
    stock: 10,
    is_new: false,
    is_featured: false,
    created_at: "2026-01-01",
    ...over,
  };
}

// Применить действия ПОСЛЕДОВАТЕЛЬНО — так же, как провайдер: каждое следующее
// действие видит результат предыдущего (через синхронный реф).
function run(cart: CartItem[], actions: CartAction[]): CartItem[] {
  return actions.reduce(cartReducer, cart);
}

describe("cartReducer: add", () => {
  it("добавляет новый товар с переданным количеством", () => {
    const cart = cartReducer([], { type: "add", product: product({ id: "a1" }), qty: 3 });
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ id: "a1", qty: 3, stock: 10, price: 100 });
  });

  it("по умолчанию добавляет 1 штуку", () => {
    const cart = cartReducer([], { type: "add", product: product({ id: "a1" }) });
    expect(cart[0].qty).toBe(1);
  });

  it("повторное добавление суммирует количество и обновляет остаток", () => {
    const cart = run([], [
      { type: "add", product: product({ id: "a1", stock: 10 }), qty: 2 },
      { type: "add", product: product({ id: "a1", stock: 7 }), qty: 3 },
    ]);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(5);
    expect(cart[0].stock).toBe(7); // остаток берётся из свежих данных товара
  });

  it("количество не превышает остаток на складе", () => {
    const cart = run([], [
      { type: "add", product: product({ id: "a1", stock: 4 }), qty: 3 },
      { type: "add", product: product({ id: "a1", stock: 4 }), qty: 5 },
    ]);
    expect(cart[0].qty).toBe(4);
  });
});

describe("cartReducer: set-qty / remove / clear", () => {
  const base = run([], [
    { type: "add", product: product({ id: "a1", stock: 5 }), qty: 2 },
    { type: "add", product: product({ id: "b2", stock: 9 }), qty: 1 },
  ]);

  it("set-qty зажимает количество в [1, остаток]", () => {
    expect(cartReducer(base, { type: "set-qty", id: "a1", qty: 99 })[0].qty).toBe(5);
    expect(cartReducer(base, { type: "set-qty", id: "a1", qty: 0 })[0].qty).toBe(1);
    expect(cartReducer(base, { type: "set-qty", id: "a1", qty: -3 })[0].qty).toBe(1);
  });

  it("set-qty без известного остатка ограничен только серверным потолком", () => {
    const noStock = base.map((i) => ({ ...i, stock: undefined }));
    const next = cartReducer(noStock, { type: "set-qty", id: "a1", qty: 5000 });
    expect(next[0].qty).toBe(MAX_QTY_PER_ITEM);
  });

  it("set-qty не трогает другие позиции", () => {
    const next = cartReducer(base, { type: "set-qty", id: "a1", qty: 4 });
    expect(next.find((i) => i.id === "b2")?.qty).toBe(1);
  });

  it("remove удаляет позицию, clear опустошает корзину", () => {
    expect(cartReducer(base, { type: "remove", id: "a1" }).map((i) => i.id)).toEqual(["b2"]);
    expect(cartReducer(base, { type: "clear" })).toEqual([]);
  });
});

describe("регрессия: несколько действий подряд не теряют друг друга", () => {
  // Кнопка «Заказать ещё раз» добавляет весь состав заказа циклом — по одному
  // addToCart на позицию, все в одном тике. До исправления провайдер считал
  // каждое действие от состояния из устаревшего замыкания useMemo, React
  // батчил setState — и в корзине выживала только ПОСЛЕДНЯЯ позиция заказа.
  it("«Заказать ещё раз»: все позиции заказа попадают в корзину", () => {
    const orderLines = [
      { product: product({ id: "tom1" }), qty: 2 },
      { product: product({ id: "per2" }), qty: 1 },
      { product: product({ id: "bak3" }), qty: 4 },
    ];
    const cart = run(
      [],
      orderLines.map(({ product, qty }): CartAction => ({ type: "add", product, qty }))
    );
    expect(cart.map((i) => [i.id, i.qty])).toEqual([
      ["tom1", 2],
      ["per2", 1],
      ["bak3", 4],
    ]);
  });

  // Зеркальная форма того же бага: быстрые удаления. Раньше второе удаление
  // считалось от корзины, где первый товар ещё лежал, — и он «воскресал».
  it("быстрые последовательные удаления опустошают корзину полностью", () => {
    const filled = run([], [
      { type: "add", product: product({ id: "a1" }) },
      { type: "add", product: product({ id: "b2" }) },
    ]);
    const cart = run(filled, [
      { type: "remove", id: "a1" },
      { type: "remove", id: "b2" },
    ]);
    expect(cart).toEqual([]);
  });

  it("смешанная последовательность применяется по порядку", () => {
    const cart = run([], [
      { type: "add", product: product({ id: "a1" }), qty: 2 },
      { type: "add", product: product({ id: "b2" }), qty: 1 },
      { type: "set-qty", id: "a1", qty: 5 },
      { type: "remove", id: "b2" },
      { type: "add", product: product({ id: "c3" }), qty: 1 },
    ]);
    expect(cart.map((i) => [i.id, i.qty])).toEqual([
      ["a1", 5],
      ["c3", 1],
    ]);
  });
});

describe("toggleWishlist", () => {
  it("добавляет отсутствующий id и убирает существующий", () => {
    expect(toggleWishlist([], "a1")).toEqual(["a1"]);
    expect(toggleWishlist(["a1", "b2"], "a1")).toEqual(["b2"]);
  });

  it("быстрые последовательные переключения не теряются", () => {
    let wl: string[] = [];
    for (const id of ["a1", "b2", "c3"]) wl = toggleWishlist(wl, id);
    expect(wl).toEqual(["a1", "b2", "c3"]);
  });
});
