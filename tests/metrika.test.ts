import { describe, expect, it } from "vitest";
import { ecommercePayload } from "@/lib/metrika";
import { plural } from "@/lib/format";
import {
  parseBreakdown,
  parseByTime,
  parseQuality,
  isoDate,
} from "@/lib/metrika-stats";
import {
  conversion,
  deltaPercent,
  mergeSeries,
  orderDayKey,
  totals,
} from "@/lib/traffic-series";

describe("ecommercePayload — слой данных электронной коммерции", () => {
  it("собирает добавление товара с количеством по умолчанию", () => {
    expect(
      ecommercePayload("add", [{ id: "p1", name: "Бычье сердце", price: 89 }])
    ).toEqual({
      ecommerce: {
        currencyCode: "RUB",
        add: {
          products: [{ id: "p1", name: "Бычье сердце", price: 89, quantity: 1 }],
        },
      },
    });
  });

  it("кладёт номер заказа и выручку в actionField", () => {
    const payload = ecommercePayload(
      "purchase",
      [{ id: "p1", name: "Дыня Колхозница", price: 50, quantity: 2 }],
      { id: "42", revenue: 100, coupon: "УРОЖАЙ" }
    );
    expect(payload).toEqual({
      ecommerce: {
        currencyCode: "RUB",
        purchase: {
          products: [
            { id: "p1", name: "Дыня Колхозница", price: 50, quantity: 2 },
          ],
          actionField: { id: "42", revenue: 100, coupon: "УРОЖАЙ" },
        },
      },
    });
  });

  it("не добавляет пустой actionField", () => {
    const payload = ecommercePayload(
      "detail",
      [{ id: "p1", name: "Перец Ласточка", price: 40 }],
      { id: undefined, revenue: undefined }
    ) as { ecommerce: { detail: Record<string, unknown> } };
    expect(payload.ecommerce.detail.actionField).toBeUndefined();
  });
});

describe("parseByTime — посещаемость по дням", () => {
  const response = {
    time_intervals: [
      ["2026-07-01", "2026-07-01"],
      ["2026-07-02", "2026-07-02"],
    ],
    // totals: ряд на КАЖДУЮ метрику (visits, users, pageviews) по интервалам
    totals: [
      [10, 20],
      [8, 15],
      [30, 44],
    ],
  };

  it("раскладывает ряды метрик по дням, не путая порядок", () => {
    expect(parseByTime(response)).toEqual([
      { date: "2026-07-01", visits: 10, users: 8, pageviews: 30 },
      { date: "2026-07-02", visits: 20, users: 15, pageviews: 44 },
    ]);
  });

  it("не падает на пустом ответе и на неожиданной форме", () => {
    expect(parseByTime({})).toEqual([]);
    expect(parseByTime(null)).toEqual([]);
    expect(
      parseByTime({ time_intervals: [["2026-07-01", "2026-07-01"]], totals: [] })
    ).toEqual([{ date: "2026-07-01", visits: 0, users: 0, pageviews: 0 }]);
  });
});

describe("parseQuality — качественные метрики", () => {
  it("читает отказы, время, глубину и долю новых", () => {
    expect(parseQuality({ totals: [23.5, 140, 3.2, 61] })).toEqual({
      bounceRate: 23.5,
      avgVisitSeconds: 140,
      pageDepth: 3.2,
      newVisitorsPercent: 61,
    });
  });

  it("возвращает null, если метрик пришло меньше, чем просили", () => {
    expect(parseQuality({ totals: [1, 2] })).toBeNull();
    expect(parseQuality({})).toBeNull();
  });
});

describe("parseBreakdown — срезы посещаемости", () => {
  it("берёт название измерения и число визитов", () => {
    expect(
      parseBreakdown({
        data: [
          { dimensions: [{ name: "Переходы из поисковых систем" }], metrics: [120] },
          { dimensions: [{ name: "Прямые заходы" }], metrics: [45] },
        ],
      })
    ).toEqual([
      { name: "Переходы из поисковых систем", visits: 120 },
      { name: "Прямые заходы", visits: 45 },
    ]);
  });

  it("подписывает пустое измерение и выбрасывает нулевые строки", () => {
    expect(
      parseBreakdown({
        data: [
          { dimensions: [{ name: "" }], metrics: [7] },
          { dimensions: [{ name: "Мобильные" }], metrics: [0] },
        ],
      })
    ).toEqual([{ name: "Не определено", visits: 7 }]);
  });
});

describe("isoDate — дата для запроса к Метрике", () => {
  it("собирает YYYY-MM-DD по локальным полям даты", () => {
    // 1 января 03:00 по местному времени: toISOString в поясе +03 отдал бы
    // 31 декабря — и отчёт уехал бы на день назад.
    expect(isoDate(new Date(2026, 0, 1, 3, 0, 0))).toBe("2026-01-01");
    expect(isoDate(new Date(2026, 11, 31, 23, 59, 0))).toBe("2026-12-31");
  });
});

describe("mergeSeries — заказы поверх дней Метрики", () => {
  const traffic = [
    { date: "2026-07-01", visits: 100, users: 80 },
    { date: "2026-07-02", visits: 50, users: 40 },
  ];

  it("раскладывает заказы по дням и суммирует выручку", () => {
    const days = mergeSeries(traffic, [
      { date: "2026-07-01 10:00:00.000Z", total: 500 },
      { date: "2026-07-01 18:30:00.000Z", total: 700 },
    ]);
    expect(days).toEqual([
      { date: "2026-07-01", visits: 100, users: 80, orders: 2, revenue: 1200 },
      { date: "2026-07-02", visits: 50, users: 40, orders: 0, revenue: 0 },
    ]);
  });

  it("игнорирует заказы вне дней Метрики — иначе день рисовался бы без визитов", () => {
    const days = mergeSeries(traffic, [{ date: "2026-06-20 10:00:00Z", total: 900 }]);
    expect(days.map((d) => d.orders)).toEqual([0, 0]);
  });

  it("не ломается на битой дате заказа", () => {
    const days = mergeSeries(traffic, [{ date: "не дата", total: 100 }]);
    expect(totals(days).orders).toBe(0);
  });
});

describe("orderDayKey — день заказа из даты PocketBase", () => {
  it("понимает формат с пробелом вместо T", () => {
    const key = orderDayKey("2026-07-14 10:00:00.000Z");
    // Ключ — локальный день администратора; проверяем форму, а не пояс.
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(orderDayKey("2026-07-14T10:00:00.000Z")).toBe(key);
  });

  it("на мусоре отдаёт пустую строку, а не NaN-дату", () => {
    expect(orderDayKey("")).toBe("");
    expect(orderDayKey("вчера")).toBe("");
  });
});

describe("conversion / deltaPercent", () => {
  it("считает долю визитов с заказом", () => {
    expect(conversion(3, 100)).toBe(3);
    expect(conversion(1, 8)).toBeCloseTo(12.5);
  });

  it("без визитов конверсии нет — null, а не ноль", () => {
    expect(conversion(0, 0)).toBeNull();
    expect(conversion(2, 0)).toBeNull();
  });

  it("изменение к прошлому периоду считается от прошлого значения", () => {
    expect(deltaPercent(120, 100)).toBe(20);
    expect(deltaPercent(50, 100)).toBe(-50);
  });

  it("рост с нуля процентом не выражается", () => {
    expect(deltaPercent(5, 0)).toBeNull();
  });
});

describe("totals — итоги периода", () => {
  it("складывает визиты, посетителей, заказы и выручку", () => {
    expect(
      totals([
        { date: "2026-07-01", visits: 10, users: 8, orders: 1, revenue: 500 },
        { date: "2026-07-02", visits: 20, users: 17, orders: 2, revenue: 900 },
      ])
    ).toEqual({ visits: 30, users: 25, orders: 3, revenue: 1400 });
  });

  it("на пустом периоде отдаёт нули", () => {
    expect(totals([])).toEqual({ visits: 0, users: 0, orders: 0, revenue: 0 });
  });
});

describe("plural — склонение после числа", () => {
  const visits: [string, string, string] = ["визит", "визита", "визитов"];

  it("ставит нужную форму по последним цифрам", () => {
    expect(plural(1, visits)).toBe("визит");
    expect(plural(2, visits)).toBe("визита");
    expect(plural(5, visits)).toBe("визитов");
    expect(plural(21, visits)).toBe("визит");
    expect(plural(92, visits)).toBe("визита");
    expect(plural(148, visits)).toBe("визитов");
  });

  it("знает про исключения второго десятка", () => {
    expect(plural(11, visits)).toBe("визитов");
    expect(plural(12, visits)).toBe("визитов");
    expect(plural(14, visits)).toBe("визитов");
    expect(plural(111, visits)).toBe("визитов");
  });

  it("не спотыкается на нуле и дробях", () => {
    expect(plural(0, visits)).toBe("визитов");
    expect(plural(1.4, visits)).toBe("визит");
  });
});
