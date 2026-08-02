import { afterEach, describe, expect, it } from "vitest";
import {
  PROMO_CODE_MAX_LENGTH,
  normalizePromoCode,
  parsePromoRule,
  promoCodesMatch,
  promoDiscount,
  promoKey,
} from "@/lib/promo";
import { envPromo } from "@/lib/promo-server";

const HARVEST = "УРОЖАЙ";

const ENV_KEYS = [
  "PROMO_HARVEST_PERCENT",
  "PROMO_HARVEST_AMOUNT",
  "PROMO_HARVEST_MIN",
  "PROMO_HARVEST_ENABLED",
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("normalizePromoCode", () => {
  it("приводит к верхнему регистру и убирает мусор вокруг", () => {
    expect(normalizePromoCode("  урожай ")).toBe(HARVEST);
    expect(normalizePromoCode("уро жай")).toBe(HARVEST);
    expect(normalizePromoCode("уро-жай")).toBe(HARVEST);
    expect(normalizePromoCode("У​РОЖАЙ")).toBe(HARVEST);
  });

  it("отбрасывает не-строки", () => {
    expect(normalizePromoCode(undefined)).toBe("");
    expect(normalizePromoCode(null)).toBe("");
    expect(normalizePromoCode(42)).toBe("");
    expect(normalizePromoCode({ code: HARVEST })).toBe("");
  });

  it("обрезает длинный ввод", () => {
    const long = normalizePromoCode("Я".repeat(5000));
    expect(long.length).toBe(PROMO_CODE_MAX_LENGTH);
  });
});

describe("promoKey / promoCodesMatch", () => {
  it("сводит похожие латинские буквы к одному ключу", () => {
    // «УPOЖAЙ» с латинскими P, O, A — типичная копипаста из мессенджера.
    expect(promoCodesMatch("УPOЖAЙ", HARVEST)).toBe(true);
    expect(promoKey("урожай")).toBe(promoKey(HARVEST));
  });

  it("не считает совпадением другой код и пустую строку", () => {
    expect(promoCodesMatch("УРОЖА", HARVEST)).toBe(false);
    expect(promoCodesMatch("", "")).toBe(false);
    expect(promoCodesMatch(null, HARVEST)).toBe(false);
  });
});

describe("promoDiscount", () => {
  const percent10 = { percent: 10, amount: 0, minSubtotal: 0 };

  it("считает проценты и округляет вниз до рубля", () => {
    expect(promoDiscount(percent10, 1000)).toBe(100);
    expect(promoDiscount(percent10, 445)).toBe(44); // 44.5 → 44
  });

  it("не даёт скидку ниже порога", () => {
    const rule = { percent: 10, amount: 0, minSubtotal: 1000 };
    expect(promoDiscount(rule, 999)).toBe(0);
    expect(promoDiscount(rule, 1000)).toBe(100);
  });

  it("никогда не превышает сумму товаров и не уходит в минус", () => {
    expect(promoDiscount({ percent: 0, amount: 500, minSubtotal: 0 }, 300)).toBe(300);
    expect(promoDiscount(percent10, 0)).toBe(0);
    expect(promoDiscount(percent10, -100)).toBe(0);
    expect(promoDiscount(percent10, Number.NaN)).toBe(0);
    expect(promoDiscount(percent10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parsePromoRule (данные из localStorage)", () => {
  it("принимает нормальное описание", () => {
    expect(
      parsePromoRule({ code: "урожай", percent: 10, amount: 0, minSubtotal: 0, label: "−10%" })
    ).toEqual({ code: HARVEST, percent: 10, amount: 0, minSubtotal: 0, label: "−10%" });
  });

  it("отбрасывает мусор и невозможные значения", () => {
    expect(parsePromoRule(null)).toBeNull();
    expect(parsePromoRule("УРОЖАЙ")).toBeNull();
    expect(parsePromoRule({ code: "", percent: 10 })).toBeNull();
    expect(parsePromoRule({ code: HARVEST })).toBeNull(); // без скидки
    expect(parsePromoRule({ code: HARVEST, percent: 200 })).toBeNull();
    expect(parsePromoRule({ code: HARVEST, percent: -10 })).toBeNull();
  });
});

describe("запасной код из окружения (пока в базе нет ни одного)", () => {
  it("по умолчанию это УРОЖАЙ со скидкой 10% на товары", () => {
    const promo = envPromo();
    expect(promo?.code).toBe(HARVEST);
    expect(promo?.percent).toBe(10);
    expect(promoDiscount(promo!, 1000)).toBe(100);
    // Условия по умолчанию — те же, что были до появления админки.
    expect(promo?.authOnly).toBe(true);
    expect(promo?.oncePerUser).toBe(true);
  });

  it("размер скидки берётся из окружения", () => {
    process.env.PROMO_HARVEST_PERCENT = "15";
    expect(envPromo()?.percent).toBe(15);
  });

  it("мусор в окружении не ломает правило", () => {
    process.env.PROMO_HARVEST_PERCENT = "не число";
    expect(envPromo()?.percent).toBe(10);
    process.env.PROMO_HARVEST_PERCENT = "-5";
    expect(envPromo()?.percent).toBe(10);
    process.env.PROMO_HARVEST_PERCENT = "500"; // потолок 90%
    expect(envPromo()?.percent).toBe(90);
  });

  it("код можно выключить", () => {
    process.env.PROMO_HARVEST_ENABLED = "false";
    expect(envPromo()).toBeNull();
    delete process.env.PROMO_HARVEST_ENABLED;
    process.env.PROMO_HARVEST_PERCENT = "0"; // и скидка 0 = кода нет
    expect(envPromo()).toBeNull();
  });
});
