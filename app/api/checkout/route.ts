import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured, mapProduct } from "@/lib/pb/shared";
import { normalizeCheckoutItems, findStockIssues, stockShortageMessage } from "@/lib/checkout";
import { reserveStock, releaseStock, restockOrderItems } from "@/lib/stock";
import { deliveryCostFor, normalizeDeliveryMethod, ozonRestrictedRegion } from "@/lib/delivery";
import { encryptField } from "@/lib/crypto";
import { isAlfaConfigured, alfaRegister } from "@/lib/alfa";
import { mailOrderPlaced } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";
import { verifyCaptcha } from "@/lib/captcha";

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

// Зависшие неоплаченные заказы: покупатель ушёл с платёжной формы и callback
// от банка так и не пришёл. Такие «пустышки» (новые, ждут оплаты дольше TTL)
// удаляем при следующем оформлении — чтобы неоплаченные заказы не копились.
// Товар, зарезервированный при оформлении, при удалении возвращаем на склад
// (restockOrderItems) — иначе он завис бы навсегда. Оплаченные и взятые
// админом в работу заказы фильтр не задевает.
const PENDING_ORDER_TTL_MS = 2 * 60 * 60 * 1000; // 2 часа

async function cleanupStalePendingOrders(
  pb: Awaited<ReturnType<typeof pbAdmin>>
): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS)
    .toISOString()
    .replace("T", " "); // формат дат PocketBase
  const stale = await pb.collection("orders").getFullList({
    filter: pb.filter(
      'status = "new" && payment_status = "pending" && placed_at < {:cutoff}',
      { cutoff }
    ),
    fields: "id",
  });
  for (const o of stale) {
    // Возвращает резерв на склад и отдаёт id позиций для удаления.
    const items = await restockOrderItems(pb, o.id);
    for (const l of items) {
      await pb.collection("order_items").delete(l.id).catch(() => {});
    }
    await pb.collection("orders").delete(o.id).catch(() => {});
  }
}

export async function POST(request: Request) {
  let body: {
    customer_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    comment?: string;
    delivery_method?: string;
    items?: IncomingItem[];
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
  // заказ, даже если клиентскую проверку обошли.
  if (delivery_method === "ozon") {
    const restricted = ozonRestrictedRegion(address);
    if (restricted) {
      return NextResponse.json(
        {
          error: `Доставка Ozon в регион «${restricted}» недоступна. Выберите другой пункт выдачи или Почту России.`,
        },
        { status: 400 }
      );
    }
  }

  // Антибот-капча (если подключена) — до любых операций с базой.
  const ip = clientIp(request);
  if (!(await verifyCaptcha(body.captchaToken, ip))) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }

  // Демо-режим без PocketBase: цены проверить негде — отдаём псевдо-номер.
  if (!isDbConfigured() || !hasAdminCredentials()) {
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
    const [productRecords, userId] = await Promise.all([
      pb.collection("products").getFullList({ filter: pb.filter(or.join(" || "), params) }),
      bestEffortUserId(),
    ]);

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

    // Сумма и доставка: стоимость доставки считаем НА СЕРВЕРЕ по тем же
    // правилам, что и на странице оформления (Почта России бесплатно от
    // порога) — клиенту не доверяем.
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const deliveryCost = deliveryCostFor(delivery_method, subtotal);
    const total = subtotal + deliveryCost;

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
      // Заказ не создался — возвращаем зарезервированный товар.
      await releaseStock(pb, reserveLines);
      throw lastError ?? new Error("order create failed");
    }

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
        { total, deliveryCost, deliveryMethod: delivery_method }
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
