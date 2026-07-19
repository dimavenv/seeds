import { describe, expect, it } from "vitest";
import { mergeCarts, sanitizeCartItems } from "@/lib/cart-merge";
import type { CartItem } from "@/lib/types";

function item(id: string, qty: number): CartItem {
  return { id, slug: id, name: id, price: 100, image_url: null, qty };
}

describe("sanitizeCartItems", () => {
  it("не-массив и мусор превращаются в пустую корзину", () => {
    expect(sanitizeCartItems(undefined)).toEqual([]);
    expect(sanitizeCartItems("cart")).toEqual([]);
    expect(sanitizeCartItems({ id: "a" })).toEqual([]);
  });

  it("отбрасывает записи без строкового id (старые числовые id Supabase)", () => {
    const good = item("abc", 1);
    expect(
      sanitizeCartItems([good, { ...item("x", 1), id: 42 as unknown as string }, null])
    ).toEqual([good]);
  });
});

describe("mergeCarts", () => {
  it("объединяет по id, количество — большее из двух (не сумма)", () => {
    const merged = mergeCarts([item("a", 2), item("b", 1)], [item("a", 5), item("c", 3)]);
    expect(merged).toHaveLength(3);
    expect(merged.find((i) => i.id === "a")!.qty).toBe(5);
    expect(merged.find((i) => i.id === "b")!.qty).toBe(1);
    expect(merged.find((i) => i.id === "c")!.qty).toBe(3);
  });

  it("не мутирует исходные корзины", () => {
    const a = [item("a", 2)];
    const b = [item("a", 5)];
    mergeCarts(a, b);
    expect(a[0].qty).toBe(2);
    expect(b[0].qty).toBe(5);
  });

  it("пустые корзины", () => {
    expect(mergeCarts([], [])).toEqual([]);
    expect(mergeCarts([], [item("a", 1)])).toEqual([item("a", 1)]);
  });
});
