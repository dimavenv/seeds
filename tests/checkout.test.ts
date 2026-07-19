import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS_PER_ORDER,
  MAX_QTY_PER_ITEM,
  findStockIssues,
  normalizeCheckoutItems,
} from "@/lib/checkout";

const ID_A = "a".repeat(15);
const ID_B = "b".repeat(15);

describe("normalizeCheckoutItems", () => {
  it("пропускает корректные позиции", () => {
    expect(normalizeCheckoutItems([{ id: ID_A, qty: 2 }])).toEqual([
      { id: ID_A, qty: 2 },
    ]);
  });

  it("отбрасывает не-массив и мусорные записи", () => {
    expect(normalizeCheckoutItems(undefined)).toEqual([]);
    expect(normalizeCheckoutItems("items")).toEqual([]);
    expect(
      normalizeCheckoutItems([null, {}, { id: "bad id!", qty: 1 }, { id: ID_A }])
    ).toEqual([]);
  });

  it("отбрасывает qty <= 0, NaN и Infinity", () => {
    expect(
      normalizeCheckoutItems([
        { id: ID_A, qty: 0 },
        { id: ID_A, qty: -3 },
        { id: ID_A, qty: NaN },
        { id: ID_A, qty: Infinity },
        { id: ID_A, qty: "5" },
      ])
    ).toEqual([]);
  });

  it("округляет дробное количество вниз (PocketBase хранит целые)", () => {
    expect(normalizeCheckoutItems([{ id: ID_A, qty: 2.9 }])).toEqual([
      { id: ID_A, qty: 2 },
    ]);
    // 0.5 после округления — ноль, позиция отбрасывается
    expect(normalizeCheckoutItems([{ id: ID_A, qty: 0.5 }])).toEqual([]);
  });

  it("сливает дубли одного товара", () => {
    expect(
      normalizeCheckoutItems([
        { id: ID_A, qty: 1 },
        { id: ID_B, qty: 1 },
        { id: ID_A, qty: 2 },
      ])
    ).toEqual([
      { id: ID_A, qty: 3 },
      { id: ID_B, qty: 1 },
    ]);
  });

  it("ограничивает количество на позицию потолком", () => {
    expect(normalizeCheckoutItems([{ id: ID_A, qty: 1_000_000 }])).toEqual([
      { id: ID_A, qty: MAX_QTY_PER_ITEM },
    ]);
  });

  it("ограничивает число позиций в заказе", () => {
    const raw = Array.from({ length: MAX_ITEMS_PER_ORDER + 50 }, (_, i) => ({
      id: `id${String(i).padStart(13, "0")}`,
      qty: 1,
    }));
    expect(normalizeCheckoutItems(raw)).toHaveLength(MAX_ITEMS_PER_ORDER);
  });
});

describe("findStockIssues", () => {
  it("возвращает пусто, когда всего хватает", () => {
    expect(
      findStockIssues([{ name: "Томат", qty: 2, stock: 5 }])
    ).toEqual([]);
  });

  it("находит нехватку и отсутствие на складе", () => {
    const lines = [
      { name: "Томат", qty: 3, stock: 2 },
      { name: "Перец", qty: 1, stock: 0 },
      { name: "Дыня", qty: 1, stock: -4 }, // отрицательный остаток = нет
      { name: "Арбуз", qty: 1, stock: 1 },
    ];
    expect(findStockIssues(lines).map((l) => l.name)).toEqual([
      "Томат",
      "Перец",
      "Дыня",
    ]);
  });
});
