import { describe, expect, it } from "vitest";
import { productDiscount } from "@/lib/product-pricing";
import { mapProduct } from "@/lib/pb/shared";

describe("product discount", () => {
  it("keeps the selling price and produces a tidy reference price", () => {
    expect(productDiscount(120, 20)).toEqual({ oldPrice: 150, percent: 20 });
    expect(productDiscount(150, 20)).toEqual({ oldPrice: 190, percent: 21 });
    expect(productDiscount(99, 20)).toEqual({ oldPrice: 123.75, percent: 20 });
  });
  it("hides absent and invalid discounts", () => {
    for (const percent of [undefined, 0, -1, 91, 100, 1.5, NaN, Infinity]) {
      expect(productDiscount(100, percent)).toBeNull();
    }
    for (const price of [0, -1, NaN, Infinity]) {
      expect(productDiscount(price, 20)).toBeNull();
    }
  });
  it("bounds rounding and derives the badge from displayed prices", () => {
    for (const price of [1, 10, 45, 99, 150, 499, 999, 1990, 9900, 15000]) {
      for (const percent of [1, 5, 20, 50, 90]) {
        const result = productDiscount(price, percent)!;
        const target = price / (1 - percent / 100);
        expect(result.oldPrice).toBeGreaterThan(price);
        expect(result.percent).toBeGreaterThanOrEqual(percent);
        expect(Math.abs(result.oldPrice - target) / target).toBeLessThanOrEqual(0.02);
        expect(result.percent).toBe(Math.round((1 - price / result.oldPrice) * 100));
      }
    }
  });
  it("reads saved discounts and defaults older records to zero", () => {
    expect(mapProduct({ id: "product", price: 120 }).discount_percent).toBe(0);
    expect(mapProduct({ id: "product", price: 120, discount_percent: 20 }).discount_percent).toBe(20);
  });
});
