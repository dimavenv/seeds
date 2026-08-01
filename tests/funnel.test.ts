import { describe, expect, it } from "vitest";
import { buildFunnel, worstStep } from "@/lib/funnel";
import { parseGoalTotals, parseGoals } from "@/lib/metrika-stats";
import { GOALS } from "@/lib/metrika";

const WANTED = Object.values(GOALS);

describe("parseGoals — сопоставление целей Метрики с нашими", () => {
  it("находит идентификатор в условии цели", () => {
    const json = {
      goals: [
        {
          id: 591636150,
          name: "Заказ оформлен",
          type: "action",
          conditions: [{ type: "exact", url: "purchase" }],
        },
        {
          id: 591636208,
          name: "Товар добавлен в корзину",
          conditions: [{ type: "exact", url: "add_to_cart" }],
        },
      ],
    };
    expect(parseGoals(json, WANTED)).toEqual([
      { id: 591636150, name: "Заказ оформлен", goal: "purchase" },
      { id: 591636208, name: "Товар добавлен в корзину", goal: "add_to_cart" },
    ]);
  });

  it("находит идентификатор в любом строковом поле условия", () => {
    // Метрика меняла имя поля; разбор не должен зависеть от конкретного ключа.
    const json = {
      goals: [{ id: 7, name: "Вход", conditions: [{ type: "action", value: "login" }] }],
    };
    expect(parseGoals(json, WANTED)).toEqual([
      { id: 7, name: "Вход", goal: "login" },
    ]);
  });

  it("пропускает чужие цели и дубли одного идентификатора", () => {
    const json = {
      goals: [
        { id: 1, name: "Просмотр страницы", conditions: [{ url: "/delivery" }] },
        { id: 2, name: "Покупка", conditions: [{ url: "purchase" }] },
        { id: 3, name: "Покупка (копия)", conditions: [{ url: "purchase" }] },
      ],
    };
    expect(parseGoals(json, WANTED)).toEqual([
      { id: 2, name: "Покупка", goal: "purchase" },
    ]);
  });

  it("не падает на пустом и неожиданном ответе", () => {
    expect(parseGoals({}, WANTED)).toEqual([]);
    expect(parseGoals(null, WANTED)).toEqual([]);
    expect(parseGoals({ goals: [{ name: "без id" }] }, WANTED)).toEqual([]);
  });
});

describe("parseGoalTotals — визиты по целям", () => {
  const goals = [
    { id: 1, name: "Корзина", goal: "add_to_cart" },
    { id: 2, name: "Покупка", goal: "purchase" },
  ];

  it("читает метрики в порядке запроса, последним — общие визиты", () => {
    expect(parseGoalTotals({ totals: [40, 5, 1000] }, goals)).toEqual({
      goals: [
        { id: 1, name: "Корзина", goal: "add_to_cart", visits: 40 },
        { id: 2, name: "Покупка", goal: "purchase", visits: 5 },
      ],
      visits: 1000,
    });
  });

  it("на пустом ответе отдаёт нули, а не падает", () => {
    expect(parseGoalTotals({}, goals)).toEqual({
      goals: [
        { id: 1, name: "Корзина", goal: "add_to_cart", visits: 0 },
        { id: 2, name: "Покупка", goal: "purchase", visits: 0 },
      ],
      visits: 0,
    });
  });
});

describe("buildFunnel — путь покупателя", () => {
  const rows = buildFunnel(1000, {
    add_to_cart: 200,
    begin_checkout: 50,
    submit_order: 40,
    purchase: 30,
  });

  it("считает долю от всех визитов", () => {
    expect(rows.map((r) => r.shareOfVisits)).toEqual([100, 20, 5, 4, 3]);
  });

  it("считает переход от предыдущего шага и потери", () => {
    expect(rows[1].shareOfPrev).toBe(20); // 200 из 1000
    expect(rows[1].lost).toBe(800);
    expect(rows[2].shareOfPrev).toBe(25); // 50 из 200
    expect(rows[4].shareOfPrev).toBe(75); // 30 из 40
    expect(rows[0].shareOfPrev).toBeNull(); // сравнивать не с чем
  });

  it("не подгоняет данные под убывающую лесенку", () => {
    // Цель «нажал Оформить» может прийти без «открыл оформление» — показываем
    // как есть, доля выходит больше 100%.
    const odd = buildFunnel(100, { begin_checkout: 10, submit_order: 12 });
    expect(odd[3].visits).toBe(12);
    expect(odd[3].shareOfPrev).toBe(120);
    expect(odd[3].lost).toBe(0);
  });

  it("без визитов не делит на ноль", () => {
    const empty = buildFunnel(0, {});
    expect(empty.every((r) => r.shareOfVisits === null)).toBe(true);
    expect(empty.every((r) => r.visits === 0)).toBe(true);
  });
});

describe("worstStep — где теряется больше всего", () => {
  it("сравнивает с обычным для шага, а не выбирает наименьший процент", () => {
    // До корзины дошло 20% — втрое лучше обычных 6%, чинить там нечего.
    // От корзины к оформлению 25% при обычных 45% — вот это провал.
    const rows = buildFunnel(1000, {
      add_to_cart: 200,
      begin_checkout: 50,
      submit_order: 40,
      purchase: 38,
    });
    const weak = worstStep(rows);
    expect(weak?.row.key).toBe("begin_checkout");
    expect(weak?.expected).toBe(45);
    expect(weak?.ratio).toBeCloseTo(25 / 45);
  });

  it("замечает технический провал на последнем шаге", () => {
    // Кнопку нажали 100 человек, заказ оформили 30: обычно доходит 90%.
    const rows = buildFunnel(1000, {
      add_to_cart: 300,
      begin_checkout: 200,
      submit_order: 100,
      purchase: 30,
    });
    expect(worstStep(rows)?.row.key).toBe("purchase");
  });

  it("молчит, пока данных мало — по трём визитам советовать нечего", () => {
    const rows = buildFunnel(5, { add_to_cart: 1, purchase: 0 });
    expect(worstStep(rows)).toBeNull();
  });

  it("молчит, когда все переходы не хуже обычных", () => {
    const rows = buildFunnel(1000, {
      add_to_cart: 100,
      begin_checkout: 60,
      submit_order: 50,
      purchase: 48,
    });
    expect(worstStep(rows)).toBeNull();
  });
});
