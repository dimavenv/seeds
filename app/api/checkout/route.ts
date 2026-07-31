import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured, mapProduct } from "@/lib/pb/shared";
import { normalizeCheckoutItems, findStockIssues, stockShortageMessage } from "@/lib/checkout";
import { reserveStock, releaseStock } from "@/lib/stock";
import { deliveryCostFor, normalizeDeliveryMethod, ozonRestriction } from "@/lib/delivery";
import { encryptField } from "@/lib/crypto";
import { isAlfaConfigured, alfaRegister } from "@/lib/alfa";
import { mailOrderPlaced } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";
import { verifyCaptcha } from "@/lib/captcha";
import { allowAttempt } from "@/lib/email-code";
import { cleanupStalePendingOrders } from "@/lib/order-cleanup";
import { normalizePromoCode, promoDiscount } from "@/lib/promo";
import {
  attachPromoUseToOrder,
  findPromoRule,
  releasePromoUse,
  reservePromoUse,
} from "@/lib/promo-server";

type IncomingItem = { id: string; qty: number };

// Привязка заказа к аккаунту — «по возможности»: если проверка сессии долго
// не отвечает, не блокируем оформление (заказ просто будет без user).
async function bestEffortUserId(): Promise<string | null> {
  try {
    const result = await Promise.race([
      getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return result?.userId ?? null;
  } catch {
    return null;
  }
}

// Следующий человекочитаемый номер заказа (продолжает нумерацию, перенесённую
// из Supabase). При гонке двух заказов уникальный индекс отобьёт дубль —
// пробуем ещё раз со следующим номером.
async function nextOrderNumber(pb: Awaited<ReturnType<typeof pbAdmin>>): Promise<number> {
  const page = await pb
    .collection("orders")
    .getList(1, 1, { sort: "-number", fields: "number" });
  const max = (page.items[0]?.number as number | undefined) ?? 0;
  return max + 1;
}

export async function POST(request: Request) {
  let body: {
    customer_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    comment?: string;
    delivery_method?: string;
    region_kladr?: string | null;
    items?: IncomingItem[];
    promo_code?: string | null;
    captchaToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const { customer_name, phone, address, email, comment } = body;
  const delivery_method = normalizeDeliveryMethod(body.delivery_method);
  // Целые количества, потолок на позицию и на число позиций, дубли слиты.
  const items = normalizeCheckoutItems(body.items);
  // Промокод: с клиента приходит ТОЛЬКО код. Правило скидки и сам факт, что
  // код ещё не потрачен, проверяются ниже по базе — присланному размеру
  // скидки здесь верить нечему, его просто нет.
  const promoCode = normalizePromoCode(body.promo_code);

  if (!customer_name?.trim() || !phone?.trim() || !address?.trim()) {
    return NextResponse.json(
      { error: "Заполните имя, телефон и адрес доставки" },
      { status: 400 }
    );
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
  }

  // Ozon не возит в Крым, Калининград и на Камчатку — не даём оформить такой
  // заказ, даже если клиентскую проверку обошли. Проверяем по нормализованному
  // коду региона DaData (если пришёл), иначе — по свободному тексту адреса.
  if (delivery_method === "ozon") {
    const restricted = ozonRestriction({
      regionKladrId: body.region_kladr,
      address,
    });
    if (restricted) {
      return NextResponse.json(
        {
          error: `Доставка Ozon в регион «${restricted}» недоступна. Выберите другой пункт выдачи или Почту России.`,
        },
        { status: 400 }
      );
    }
  }

  // Ограничение частоты оформления с одного IP — чтобы нельзя было массово
  // создавать заказы (резервировать весь склад, спамить письмами продавцу).
  // Лимитер в памяти воркера — достаточно как приложенческий слой поверх
  // nginx limit_req (см. deploy/nginx.conf).
  const ip = clientIp(request);
  if (!allowAttempt(`checkout:${ip ?? "?"}`, 15, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Слишком много попыток оформления — подождите пару минут" },
      { status: 429 }
    );
  }

  // Антибот-капча (если подключена) — до любых операций с базой.
  if (!(await verifyCaptcha(body.captchaToken, ip, { failClosed: true }))) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }

  // Демо-режим без PocketBase: цены проверить негде — отдаём псевдо-номер.
  if (!isDbConfigured() || !hasAdminCredentials()) {
    if (promoCode) {
      // Без базы «один раз на аккаунт» не проверить — скидку не даём.
      return NextResponse.json(
        {
          error: "Промокоды временно недоступны — оформите заказ без кода",
          promoError: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      id: Math.floor(Date.now() / 1000) % 1000000,
      total: 0,
      demo: true,
    });
  }

  const isTimeout = (e: unknown) => {
    const t = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`.toLowerCase();
    return t.includes("abort") || t.includes("timeout") || t.includes("fetch failed");
  };

  try {
    const pb = await pbAdmin();

    // Параллельно: авторитетные цены (суперпользователем) и best-effort
    // привязка к аккаунту.
    const params: Record<string, string> = {};
    const or = items.map((it, i) => {
      params[`id${i}`] = it.id;
      return `id = {:id${i}}`;
    });
    const [productRecords, bestEffortUser] = await Promise.all([
      pb.collection("products").getFullList({ filter: pb.filter(or.join(" || "), params) }),
      bestEffortUserId(),
    ]);
    let userId = bestEffortUser;

    const priceList = productRecords.map(mapProduct);

    const lines = items
      .map((i) => {
        const p = priceList.find((x) => x.id === i.id);
        if (!p) return null;
        return { product: p.id, name: p.name, price: p.price, qty: i.qty, stock: p.stock };
      })
      .filter(Boolean) as {
      product: string;
      name: string;
      price: number;
      qty: number;
      stock: number;
    }[];

    if (lines.length === 0) {
      return NextResponse.json({ error: "Товары не найдены" }, { status: 400 });
    }

    // Сумма товаров — база и для скидки, и для доставки, и для итога.
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

    // ===== Промокод: проверки ДО любых записей =====
    // Порядок важен: сначала убеждаемся, что код вообще существует и что
    // покупатель вошёл в аккаунт, и только потом (после резерва товара)
    // закрепляем код за аккаунтом. Так неудачная проверка не оставляет за
    // собой ни списанных остатков, ни «сгоревшего» промокода.
    const promoRule = promoCode ? findPromoRule(promoCode) : null;
    if (promoCode && !promoRule) {
      return NextResponse.json(
        {
          error: "Такого промокода нет или он больше не действует",
          promoError: true,
        },
        { status: 400 }
      );
    }
    if (promoRule) {
      // Привязка к аккаунту здесь обязана быть достоверной: bestEffortUserId
      // отдаёт null и при медленной проверке сессии, а «не смогли проверить»
      // не должно превращаться ни в «гость» (обидно), ни тем более в скидку
      // без учёта использования. Поэтому — строгая проверка.
      if (!userId) {
        try {
          userId = (await getSession()).userId;
        } catch {
          return NextResponse.json(
            {
              error: "Не удалось проверить аккаунт — попробуйте ещё раз",
              promoError: true,
            },
            { status: 503 }
          );
        }
      }
      if (!userId) {
        return NextResponse.json(
          {
            error:
              "Промокод действует только для покупателей с аккаунтом. Войдите в свой аккаунт и оформите заказ ещё раз.",
            promoError: true,
            needAuth: true,
          },
          { status: 401 }
        );
      }
      if (subtotal < promoRule.minSubtotal) {
        return NextResponse.json(
          {
            error: `Промокод действует при сумме товаров от ${promoRule.minSubtotal} ₽`,
            promoError: true,
          },
          { status: 400 }
        );
      }
      // Нулевая скидка (например, копеечный заказ при скидке в процентах) —
      // отказываем сразу: иначе одноразовый код сгорел бы впустую.
      if (promoDiscount(promoRule, subtotal) <= 0) {
        return NextResponse.json(
          {
            error: "Промокод не даёт скидку на эту сумму заказа",
            promoError: true,
          },
          { status: 400 }
        );
      }
    }

    // Предпроверка наличия по свежим данным БД — чтобы в типовом случае
    // (устаревшая корзина) вернуть понятное пер-товарное сообщение.
    const shortages = findStockIssues(lines);
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: stockShortageMessage(shortages) },
        { status: 409 }
      );
    }

    // Атомарное резервирование: списание всех позиций одной транзакцией
    // PocketBase (min: 0 на stock не даст уйти в минус). Именно здесь
    // закрывается гонка «двое покупают последний пакетик»: предпроверку выше
    // могли пройти оба, но транзакция спишет остаток только одному.
    const reserveLines = lines.map((l) => ({ productId: l.product, qty: l.qty }));
    if ((await reserveStock(pb, reserveLines)) === "conflict") {
      // Кто-то успел выкупить остаток между предпроверкой и списанием.
      // Перечитываем остатки ради точного сообщения.
      const fresh = await pb
        .collection("products")
        .getFullList({ filter: pb.filter(or.join(" || "), params), fields: "id,name,stock" })
        .catch(() => null);
      const freshShortages = fresh
        ? findStockIssues(
            lines.map((l) => {
              const f = fresh.find((x) => x.id === l.product);
              return { name: l.name, qty: l.qty, stock: f ? Number(f.stock) || 0 : 0 };
            })
          )
        : [];
      return NextResponse.json(
        {
          error:
            freshShortages.length > 0
              ? stockShortageMessage(freshShortages)
              : "Не получилось зарезервировать товар — остатки только что изменились. Попробуйте ещё раз.",
        },
        { status: 409 }
      );
    }

    // ===== Промокод: закрепление за аккаунтом =====
    // Ровно один раз на аккаунт обеспечивает уникальный индекс (user, code) в
    // коллекции promo_uses: одновременные оформления сериализуются базой, и
    // вставку получает только одно из них. Резерв снимается на всех откатах
    // ниже (заказ не создался, состав не сохранился, платёж не завёлся).
    let promoUseId: string | null = null;
    let discount = 0;
    if (promoRule && userId) {
      const reserved = await reservePromoUse(pb, userId, promoRule.code);
      if (reserved.status !== "reserved") {
        await releaseStock(pb, reserveLines);
        return NextResponse.json(
          {
            error:
              reserved.status === "used"
                ? "Этот промокод уже использован на вашем аккаунте"
                : "Не удалось проверить промокод — попробуйте ещё раз",
            promoError: true,
          },
          { status: reserved.status === "used" ? 409 : 503 }
        );
      }
      promoUseId = reserved.id;
      // Скидка считается ЗДЕСЬ, от авторитетных цен из базы.
      discount = promoDiscount(promoRule, subtotal);
    }

    // Сумма и доставка: стоимость доставки считаем НА СЕРВЕРЕ по тем же
    // правилам, что и на странице оформления (Почта России бесплатно от
    // порога) — клиенту не доверяем. Скидка по промокоду уменьшает только
    // товары: порог бесплатной доставки берётся от суммы ДО скидки (так же
    // показано в корзине и на оформлении).
    const deliveryCost = deliveryCostFor(delivery_method, subtotal);
    const total = Math.max(0, subtotal - discount) + deliveryCost;

    // Создание заказа: до 3 попыток на случай гонки за номер.
    let order: { id: string; number: number } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !order; attempt++) {
      try {
        const number = (await nextOrderNumber(pb)) + attempt;
        const rec = await pb.collection("orders").create({
          number,
          customer_name: customer_name.trim(),
          phone: encryptField(phone.trim()),
          email: encryptField(email?.trim() || null) ?? "",
          address: encryptField(address.trim()),
          comment: comment?.trim() || "",
          delivery_method,
          delivery_cost: deliveryCost,
          promo_code: promoRule && discount > 0 ? promoRule.code : "",
          discount,
          total,
          status: "new",
          payment_status: "unpaid",
          user: userId ?? "",
          placed_at: new Date().toISOString(),
        });
        order = { id: rec.id, number: rec.number as number };
      } catch (e) {
        lastError = e;
      }
    }
    if (!order) {
      // Заказ не создался — возвращаем зарезервированный товар и промокод.
      await releaseStock(pb, reserveLines);
      if (promoUseId) await releasePromoUse(pb, promoUseId);
      throw lastError ?? new Error("order create failed");
    }

    // Привязываем использование промокода к заказу: по этой связи код
    // вернётся покупателю, если заказ потом удалят как неоплаченный
    // (callback банка или уборка зависших заказов).
    if (promoUseId) await attachPromoUseToOrder(pb, promoUseId, order.id);

    // Фоновая уборка старых зависших неоплаченных заказов — не задерживает
    // текущее оформление и не роняет его при ошибке.
    void cleanupStalePendingOrders(pb).catch(() => {});

    try {
      for (const l of lines) {
        await pb.collection("order_items").create({
          order: order.id,
          product: l.product,
          name: l.name,
          price: l.price,
          qty: l.qty,
        });
      }
    } catch {
      // Состав не сохранился — откатываем заказ и возвращаем резерв,
      // чтобы не осталось «пустышки» с зависшим списанием.
      await releaseStock(pb, reserveLines);
      if (promoUseId) await releasePromoUse(pb, promoUseId);
      await pb.collection("orders").delete(order.id).catch(() => {});
      return NextResponse.json(
        { error: "Не удалось сохранить состав заказа" },
        { status: 500 }
      );
    }

    // Онлайн-оплата (если подключён Альфа-Банк). Если платёж создать не
    // удалось — заказ УДАЛЯЕТСЯ, а покупателю возвращается ошибка: корзина у
    // него остаётся, «неоплачиваемых» заказов в базе не копим.
    if (isAlfaConfigured()) {
      let reg: Awaited<ReturnType<typeof alfaRegister>> | null = null;
      try {
        const base = (process.env.SITE_URL || "https://tomatsemena.ru").replace(/\/+$/, "");
        reg = await alfaRegister({
          orderNumber: order.id, // уникальный стабильный id записи заказа
          amount: String(Math.round(total * 100)), // рубли → копейки
          currency: "643", // RUB по ISO 4217
          returnUrl: `${base}/order/${order.number}?paid=1`,
          failUrl: `${base}/order/${order.number}?failed=1`,
          description: `Заказ №${order.number}`,
          language: "ru",
          ...(email?.trim() ? { email: email.trim() } : {}),
        });
      } catch (e) {
        console.error(`[checkout] заказ №${order.number}: онлайн-оплата не создана:`, e);
        reg = null;
      }

      if (reg?.formUrl && reg.orderId) {
        try {
          await pb.collection("orders").update(order.id, {
            alfa_order_id: reg.orderId,
            payment_status: "pending",
          });
        } catch (e) {
          // Оплата в банке уже создана — ведём покупателя на форму, а сбой
          // записи логируем (без alfa_order_id не сработает возврат из админки).
          console.error(`[checkout] заказ №${order.number}: не записался alfa_order_id:`, e);
        }
        // Письмо «заказ принят» здесь не шлём: придёт «оплата получена»
        // после успешной оплаты (callback), а неоплаченный заказ удалится.
        return NextResponse.json({ id: order.number, total, formUrl: reg.formUrl });
      }

      // Платёж не создался — откатываем заказ целиком, корзина у покупателя
      // цела, зарезервированный товар возвращаем на склад.
      if (reg?.errorMessage) {
        console.error(`[checkout] заказ №${order.number}: банк отказал — ${reg.errorMessage}`);
      }
      await releaseStock(pb, reserveLines);
      if (promoUseId) await releasePromoUse(pb, promoUseId);
      for (const l of await pb
        .collection("order_items")
        .getFullList({ filter: pb.filter("order = {:id}", { id: order.id }), fields: "id" })
        .catch(() => [] as { id: string }[])) {
        await pb.collection("order_items").delete(l.id).catch(() => {});
      }
      await pb.collection("orders").delete(order.id).catch(() => {});
      return NextResponse.json(
        {
          error:
            "Онлайн-оплата сейчас недоступна — заказ не оформлен, товары остались в корзине. Попробуйте ещё раз через пару минут.",
        },
        { status: 502 }
      );
    }

    // Без онлайн-оплаты заказ оформлен сразу и окончательно. Товар уже
    // зарезервирован выше (reserveStock) — повторно списывать не нужно.
    // Шлём «заказ принят».
    if (email?.trim()) {
      void mailOrderPlaced(
        { to: email.trim(), number: order.number, name: customer_name.trim() },
        lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
        {
          total,
          deliveryCost,
          deliveryMethod: delivery_method,
          discount,
          promoCode: discount > 0 ? promoRule?.code ?? null : null,
        }
      ).catch(() => {});
    }
    // Уведомление продавцу «у вас новый заказ». При онлайн-оплате оно уходит
    // из callback после успешной оплаты (см. app/api/payment/callback).
    void notifyNewOrder({
      id: order.id,
      number: order.number,
      total,
      deliveryCost,
      deliveryMethod: delivery_method,
      discount,
      promoCode: discount > 0 ? promoRule?.code ?? null : null,
      paid: false,
      customer: {
        name: customer_name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address.trim(),
        comment: comment?.trim() || null,
      },
      items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
    }).catch(() => {});

    return NextResponse.json({ id: order.number, total });
  } catch (e) {
    return NextResponse.json(
      {
        error: isTimeout(e)
          ? "База долго отвечает, попробуйте ещё раз"
          : "Не удалось создать заказ",
      },
      { status: 503 }
    );
  }
}
