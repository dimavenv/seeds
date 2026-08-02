import { describe, expect, it } from "vitest";
import type PocketBase from "pocketbase";
import { promoLabel, promoStatus } from "@/lib/promo";
import { checkPromo, mapPromo, promoUsage } from "@/lib/promo-server";

// Заглушка PocketBase: отдаёт заранее заданные ответы и запоминает фильтры.
// Настоящий клиент здесь не нужен — проверяем ПОРЯДОК и СМЫСЛ проверок, а не
// работу драйвера базы.
function fakePb(opts: {
  promos?: Record<string, unknown>[];
  promoUses?: number;
  userOrders?: number;
  promoOrders?: number;
  orders?: Record<string, unknown>[];
  failOn?: string;
}): PocketBase {
  const {
    promos = [],
    promoUses = 0,
    userOrders = 0,
    promoOrders = 0,
    orders = [],
  } = opts;

  return {
    // Настоящий pb.filter подставляет параметры; для теста достаточно строки.
    filter: (expr: string) => expr,
    collection: (name: string) => ({
      getFullList: async (q?: { filter?: string }) => {
        if (name === opts.failOn) throw new Error("база недоступна");
        if (name === "promos") return promos;
        if (name === "orders") return orders;
        return [];
      },
      getList: async (_page: number, _per: number, q?: { filter?: string }) => {
        if (name === opts.failOn) throw new Error("база недоступна");
        const filter = q?.filter ?? "";
        if (name === "promo_uses") return { totalItems: promoUses };
        if (name === "orders") {
          // Два разных счёта по заказам: «заказы покупателя» и «заказы с кодом».
          return { totalItems: filter.includes("promo_code") ? promoOrders : userOrders };
        }
        return { totalItems: 0 };
      },
    }),
  } as unknown as PocketBase;
}

const BASE = {
  id: "p1",
  code: "ВЕСНА",
  percent: 10,
  amount: 0,
  min_subtotal: 0,
  starts_at: "",
  expires_at: "",
  enabled: true,
  auth_only: true,
  once_per_user: true,
  first_order_only: false,
  max_uses: 0,
  note: "",
};

describe("mapPromo — запись базы в описание кода", () => {
  it("читает поля и режет проценты по потолку", () => {
    const p = mapPromo({ ...BASE, percent: 200, min_subtotal: 500 });
    expect(p.percent).toBe(90);
    expect(p.minSubtotal).toBe(500);
    expect(p.code).toBe("ВЕСНА");
  });

  it("даты приводит к дню, время отбрасывает", () => {
    const p = mapPromo({
      ...BASE,
      starts_at: "2026-03-01 00:00:00.000Z",
      expires_at: "2026-05-31 00:00:00.000Z",
    });
    expect(p.startsAt).toBe("2026-03-01");
    expect(p.expiresAt).toBe("2026-05-31");
  });

  it("у старых записей без полей условия остаются строгими", () => {
    // Осторожность важнее удобства: код без явного «можно гостям» не должен
    // вдруг стать доступен всем.
    const p = mapPromo({ id: "x", code: "СТАРЫЙ", percent: 5 });
    expect(p.authOnly).toBe(true);
    expect(p.oncePerUser).toBe(true);
    expect(p.firstOrderOnly).toBe(false);
    expect(p.enabled).toBe(true);
  });

  it("мусор в числах превращается в ноль, а не в NaN", () => {
    const p = mapPromo({ ...BASE, amount: "много", max_uses: -3 });
    expect(p.amount).toBe(0);
    expect(p.maxUses).toBe(0);
  });
});

describe("promoStatus — срок действия по дням", () => {
  const sched = { enabled: true, startsAt: "2026-03-01", expiresAt: "2026-05-31" };

  it("последний день ещё рабочий", () => {
    expect(promoStatus(sched, "2026-05-31")).toBe("active");
    expect(promoStatus(sched, "2026-06-01")).toBe("expired");
  });

  it("до начала — «ещё не начался»", () => {
    expect(promoStatus(sched, "2026-02-28")).toBe("scheduled");
    expect(promoStatus(sched, "2026-03-01")).toBe("active");
  });

  it("выключенный код не оживает датами", () => {
    expect(promoStatus({ ...sched, enabled: false }, "2026-04-01")).toBe("disabled");
  });

  it("без дат код бессрочный", () => {
    expect(
      promoStatus({ enabled: true, startsAt: "", expiresAt: "" }, "2030-01-01")
    ).toBe("active");
  });
});

describe("promoLabel", () => {
  it("процент важнее суммы — как и в расчёте скидки", () => {
    expect(promoLabel({ percent: 10, amount: 300 })).toBe("−10% на товары");
    expect(promoLabel({ percent: 0, amount: 300 })).toBe("−300 ₽ на заказ");
    expect(promoLabel({ percent: 0, amount: 0 })).toBe("");
  });
});

describe("checkPromo — условия применения", () => {
  it("несуществующий код — 404", async () => {
    const res = await checkPromo(fakePb({ promos: [BASE] }), {
      code: "ДРУГОЙ",
      userId: "u1",
    });
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it("выключенный и истёкший коды неотличимы от несуществующего", async () => {
    const off = await checkPromo(
      fakePb({ promos: [{ ...BASE, enabled: false }] }),
      { code: "ВЕСНА", userId: "u1" }
    );
    expect(off).toMatchObject({ ok: false, status: 404 });

    const expired = await checkPromo(
      fakePb({ promos: [{ ...BASE, expires_at: "2020-01-01 00:00:00.000Z" }] }),
      { code: "ВЕСНА", userId: "u1" }
    );
    expect(expired).toMatchObject({ ok: false, status: 404 });
  });

  it("гостю с кодом «только для аккаунтов» — 401 и подсказка войти", async () => {
    const res = await checkPromo(fakePb({ promos: [BASE] }), {
      code: "ВЕСНА",
      userId: null,
    });
    expect(res).toMatchObject({ ok: false, status: 401, needAuth: true });
  });

  it("гостя пускает, если код для всех", async () => {
    const res = await checkPromo(
      fakePb({
        promos: [{ ...BASE, auth_only: false, once_per_user: false }],
      }),
      { code: "ВЕСНА", userId: null, subtotal: 1000 }
    );
    expect(res).toMatchObject({ ok: true, discount: 100 });
  });

  it("повторное применение одноразового кода — 409", async () => {
    const res = await checkPromo(fakePb({ promos: [BASE], promoUses: 1 }), {
      code: "ВЕСНА",
      userId: "u1",
    });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("«только первый заказ» отсекает покупателя с заказами", async () => {
    const promos = [{ ...BASE, first_order_only: true, once_per_user: false }];
    const withOrders = await checkPromo(fakePb({ promos, userOrders: 2 }), {
      code: "ВЕСНА",
      userId: "u1",
    });
    expect(withOrders).toMatchObject({ ok: false, status: 409 });

    const newcomer = await checkPromo(fakePb({ promos, userOrders: 0 }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 1000,
    });
    expect(newcomer).toMatchObject({ ok: true });
  });

  it("исчерпанный общий лимит закрывает код", async () => {
    const promos = [{ ...BASE, max_uses: 50, once_per_user: false }];
    const done = await checkPromo(fakePb({ promos, promoOrders: 50 }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 1000,
    });
    expect(done).toMatchObject({ ok: false, status: 409 });

    const left = await checkPromo(fakePb({ promos, promoOrders: 49 }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 1000,
    });
    expect(left).toMatchObject({ ok: true });
  });

  it("порог суммы проверяется только когда сумма известна", async () => {
    const promos = [{ ...BASE, min_subtotal: 1500 }];
    // Корзина спрашивает без суммы — код принимаем, порог проверит оформление.
    const inCart = await checkPromo(fakePb({ promos }), {
      code: "ВЕСНА",
      userId: "u1",
    });
    expect(inCart).toMatchObject({ ok: true, discount: 0 });

    const tooSmall = await checkPromo(fakePb({ promos }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 1000,
    });
    expect(tooSmall).toMatchObject({ ok: false, status: 400 });
    expect((tooSmall as { error: string }).error).toContain("1500");
  });

  it("нулевая скидка — отказ: одноразовый код не должен сгореть впустую", async () => {
    const res = await checkPromo(
      fakePb({ promos: [{ ...BASE, percent: 0, amount: 0, min_subtotal: 0 }] }),
      { code: "ВЕСНА", userId: "u1", subtotal: 1000 }
    );
    // Код без скидки вообще не считается действующим (percent и amount = 0).
    expect(res.ok).toBe(false);
  });

  it("сбой базы не выдаёт скидку молча", async () => {
    const res = await checkPromo(
      fakePb({ promos: [BASE], failOn: "promo_uses" }),
      { code: "ВЕСНА", userId: "u1", subtotal: 1000 }
    );
    expect(res).toMatchObject({ ok: false, status: 503 });
  });

  it("считает скидку в рублях и не уводит заказ в минус", async () => {
    const promos = [{ ...BASE, percent: 0, amount: 300, once_per_user: false }];
    const normal = await checkPromo(fakePb({ promos }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 1000,
    });
    expect(normal).toMatchObject({ ok: true, discount: 300 });

    const tiny = await checkPromo(fakePb({ promos }), {
      code: "ВЕСНА",
      userId: "u1",
      subtotal: 200,
    });
    expect(tiny).toMatchObject({ ok: true, discount: 200 });
  });
});

describe("promoUsage — сколько раз кодом воспользовались", () => {
  it("считает заказы по кодам, приводя написание к общему виду", async () => {
    const counts = await promoUsage(
      fakePb({
        orders: [
          { promo_code: "ВЕСНА" },
          { promo_code: "весна" },
          { promo_code: "ЛЕТО" },
        ],
      })
    );
    expect(counts.get("ВЕСНА")).toBe(2);
    expect(counts.get("ЛЕТО")).toBe(1);
  });

  it("на сбое базы отдаёт пустой счёт, а не падает", async () => {
    const counts = await promoUsage(fakePb({ failOn: "orders" }));
    expect(counts.size).toBe(0);
  });
});
