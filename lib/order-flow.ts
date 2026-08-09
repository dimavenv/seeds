import "server-only";
import type PocketBase from "pocketbase";
import { decryptField } from "@/lib/crypto";
import { releaseStock, reserveStock } from "@/lib/stock";
import { mailOrderPlaced, mailPayment } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";
import { ensureAccountForOrder } from "@/lib/auto-account";
import type { PaymentStatus } from "@/lib/types";

// Жизненный цикл заказа с онлайн-оплатой.
//
// Заказ пишется в базу СРАЗУ при оформлении — со статусом оплаты «pending»
// («ожидает оплаты»). Так продавец видит в админке и незавершённые попытки, а
// покупатель может доплатить заказ позже кнопкой «Оплатить» (в личном кабинете
// или на странице «оплата не прошла»). Раньше до подтверждения денег заказа не
// существовало вовсе: он собирался из отдельной коллекции payment_drafts, и
// брошенная оплата не оставляла следов.
//
// Состояния оплаты (orders.payment_status):
//   pending  — счёт выставлен, денег ещё нет; товар зарезервирован;
//   paid     — деньги подтверждены (уведомление Robokassa или прямая сверка);
//   failed   — попытка протухла: резерв возвращён на склад, заказ остался в
//              базе с пометкой «не оплачен», оплатить можно заново;
//   unpaid   — заказ без онлайн-оплаты (оплата при получении).
//
// Номер счёта Robokassa (invoice_id) уникален: по нему приходит уведомление об
// оплате и делается возврат. При повторной попытке оплаты выдаётся НОВЫЙ номер
// (старый счёт мог протухнуть по ExpirationDate) — см. startPaymentAttempt.

export type OrderLine = {
  product: string;
  name: string;
  price: number;
  qty: number;
};

// Всё, из чего собирается заказ. Персональные данные приходят сюда уже
// зашифрованными (encryptField) — расшифровываются только для писем.
export type OrderPayload = {
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  comment: string;
  delivery_method: string;
  delivery_cost: number;
  promo_code: string;
  discount: number;
  total: number;
  user: string;
  items: OrderLine[];
};

// Полный набор состояний оплаты живёт в lib/types (там же подписи для UI);
// «refunded» ставит возврат из админки.
export type PaymentState = PaymentStatus;

// Следующий номер счёта — от максимума среди уже выставленных.
export async function nextInvoiceId(pb: PocketBase): Promise<number> {
  const page = await pb
    .collection("orders")
    .getList(1, 1, { sort: "-invoice_id", fields: "invoice_id" })
    .catch(() => null);
  return (Number(page?.items[0]?.invoice_id ?? 0) || 0) + 1;
}

// Следующий человекочитаемый номер заказа (продолжает нумерацию, перенесённую
// из Supabase). При гонке двух заказов уникальный индекс отобьёт дубль —
// пробуем ещё раз со следующим номером.
async function nextOrderNumber(pb: PocketBase): Promise<number> {
  const page = await pb
    .collection("orders")
    .getList(1, 1, { sort: "-number", fields: "number" });
  return (Number(page.items[0]?.number ?? 0) || 0) + 1;
}

export type CreatedOrder = { id: string; number: number };

// Создание заказа со списком позиций. Используется и для оплаты при получении
// (paymentStatus: "unpaid"), и для онлайн-оплаты (pending + invoiceId).
export async function createOrderWithItems(
  pb: PocketBase,
  payload: OrderPayload,
  extra: { invoiceId?: number; paymentStatus: PaymentState }
): Promise<CreatedOrder> {
  const now = new Date().toISOString();
  let order: CreatedOrder | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    try {
      const number = (await nextOrderNumber(pb)) + attempt;
      const rec = await pb.collection("orders").create({
        number,
        ...(extra.invoiceId ? { invoice_id: extra.invoiceId } : {}),
        customer_name: payload.customer_name,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        comment: payload.comment,
        delivery_method: payload.delivery_method,
        delivery_cost: payload.delivery_cost,
        promo_code: payload.promo_code,
        discount: payload.discount,
        total: payload.total,
        status: "new",
        payment_status: extra.paymentStatus,
        // Момент начала оплаты — по нему уборка понимает, что попытка протухла
        // и резерв пора вернуть (см. lib/order-cleanup.ts).
        ...(extra.paymentStatus === "pending" ? { pay_started_at: now } : {}),
        user: payload.user,
        placed_at: now,
      });
      order = { id: rec.id, number: Number(rec.number) };
    } catch (e) {
      lastError = e;
    }
  }
  if (!order) throw lastError ?? new Error("order create failed");

  try {
    for (const l of payload.items) {
      await pb.collection("order_items").create({
        order: order.id,
        product: l.product,
        name: l.name,
        price: l.price,
        qty: l.qty,
      });
    }
  } catch (e) {
    // Состав не сохранился — «пустышка» без позиций никому не нужна.
    await pb.collection("orders").delete(order.id).catch(() => {});
    throw e;
  }
  return order;
}

export type OrderRecord = {
  id: string;
  number: number;
  invoiceId: number | null;
  paymentStatus: PaymentState;
  // Статус самого заказа (new/processing/shipped/done/cancelled).
  status: string;
  total: number;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  comment: string;
  deliveryMethod: string;
  deliveryCost: number;
  promoCode: string;
  discount: number;
  user: string;
  payStartedAt: string;
};

export function toOrderRecord(rec: Record<string, unknown>): OrderRecord {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: String(rec.id),
    number: Number(rec.number ?? 0),
    invoiceId: Number(rec.invoice_id ?? 0) || null,
    paymentStatus: (s(rec.payment_status) || "unpaid") as PaymentState,
    status: s(rec.status) || "new",
    total: Number(rec.total ?? 0),
    customerName: s(rec.customer_name),
    email: s(rec.email),
    phone: s(rec.phone),
    address: s(rec.address),
    comment: s(rec.comment),
    deliveryMethod: s(rec.delivery_method),
    deliveryCost: Number(rec.delivery_cost ?? 0),
    promoCode: s(rec.promo_code),
    discount: Number(rec.discount ?? 0),
    user: s(rec.user),
    payStartedAt: s(rec.pay_started_at),
  };
}

export async function findOrderByInvoice(
  pb: PocketBase,
  invId: number
): Promise<OrderRecord | null> {
  const rec = await pb
    .collection("orders")
    .getFirstListItem(pb.filter("invoice_id = {:inv}", { inv: invId }))
    .catch(() => null);
  return rec ? toOrderRecord(rec as unknown as Record<string, unknown>) : null;
}

export async function orderLines(
  pb: PocketBase,
  orderId: string
): Promise<OrderLine[]> {
  const items = await pb
    .collection("order_items")
    .getFullList({ filter: pb.filter("order = {:id}", { id: orderId }) })
    .catch(() => []);
  return items.map((i) => ({
    product: String(i.product ?? ""),
    name: String(i.name ?? ""),
    price: Number(i.price ?? 0),
    qty: Number(i.qty ?? 0),
  }));
}

// Коллекция-«однократность»: уникальный индекс по inv_id пропускает создание
// записи только одному вызову, остальные получают ошибку. Записи крошечные
// (номер счёта + дата) и остаются как след подтверждённых оплат.
const CLAIMS_COLLECTION = "payment_claims";

async function claimPaidNotifications(
  pb: PocketBase,
  invId: number
): Promise<boolean> {
  try {
    await pb.collection(CLAIMS_COLLECTION).create({ inv_id: invId });
    return true;
  } catch (e) {
    // 400 — индекс отбил дубль: письма уже отправляет кто-то другой.
    if ((e as { status?: number })?.status === 400) return false;
    // Всё остальное (нет коллекции — схему не импортировали, база не
    // ответила) — не повод молча проглотить письма об оплате: шлём.
    console.error(
      `[robokassa] счёт ${invId}: заявку на письма поставить не удалось (проверьте «npm run db:schema»):`,
      e
    );
    return true;
  }
}

export type PaidResult = {
  order: CreatedOrder;
  // true — оплату подтвердил именно этот вызов (значит, письма шлём здесь).
  alreadyPaid: boolean;
};

// Подтверждение оплаты по номеру счёта. Идемпотентно: уведомление Robokassa,
// возврат покупателя и уборка вызывают его наперегонки, и все три должны
// отработать без дублей писем.
export async function markOrderPaid(
  pb: PocketBase,
  invId: number
): Promise<PaidResult | null> {
  const order = await findOrderByInvoice(pb, invId);
  if (!order) return null;

  const done = { id: order.id, number: order.number };
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return { order: done, alreadyPaid: true };
  }

  const lines = await orderLines(pb, order.id);

  // Покупатель отменил заказ, а деньги всё равно пришли (успел оплатить в
  // соседней вкладке). Статус «отменён» не трогаем — продавец увидит
  // «Отменён · Оплачен» и вернёт деньги.
  if (order.status === "cancelled") {
    console.error(
      `[robokassa] счёт ${invId}: оплата пришла по ОТМЕНЁННОМУ заказу №${order.number} — нужен возврат денег`
    );
  }

  // Попытка успела протухнуть (уборка сняла резерв), а деньги всё-таки
  // пришли — возвращаем товар в резерв. Не получилось (успели раскупить) —
  // громко в лог: разбираться придётся продавцу, деньги уже у него.
  if (order.paymentStatus === "failed") {
    const reserve = lines
      .filter((l) => l.product)
      .map((l) => ({ productId: l.product, qty: l.qty }));
    if (reserve.length > 0 && (await reserveStock(pb, reserve)) === "conflict") {
      console.error(
        `[robokassa] счёт ${invId}: оплата пришла после отмены резерва, товара на складе не хватает — заказ №${order.number} требует ручной проверки`
      );
    }
  }

  try {
    await pb.collection("orders").update(order.id, {
      payment_status: "paid",
      pay_started_at: "",
    });
  } catch (e) {
    console.error(`[robokassa] счёт ${invId}: не удалось пометить оплату:`, e);
    throw e;
  }

  // Ровно одни письма на счёт. Уведомление Robokassa, возврат покупателя и
  // уборка приходят наперегонки и могут прочитать «ещё не оплачен» все трое —
  // статус от этого не портится, а вот «оплата получена» продавцу и особенно
  // письмо с паролем от нового кабинета дублировать нельзя. Заявку ставим
  // ПОСЛЕ смены статуса: если заявка займётся, а запись статуса упадёт, заказ
  // навсегда остался бы «ожидающим оплаты».
  if (!(await claimPaidNotifications(pb, invId))) {
    return { order: done, alreadyPaid: true };
  }

  const to = decryptField(order.email) ?? "";
  const items = lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty }));

  // Аккаунт покупателю — только здесь, после подтверждённой оплаты.
  void ensureAccountForOrder(pb, {
    orderId: order.id,
    email: to,
    customerName: order.customerName,
    phone: decryptField(order.phone) ?? "",
    alreadyLinked: Boolean(order.user),
  }).catch((e) => {
    console.error(`[account] аккаунт по заказу №${order.number} не создан:`, e);
  });

  void mailPayment(
    { to, number: order.number, name: order.customerName },
    "paid",
    order.total,
    items
  ).catch(() => {});

  void notifyNewOrder({
    id: order.id,
    number: order.number,
    total: order.total,
    deliveryCost: order.deliveryCost,
    deliveryMethod: order.deliveryMethod || null,
    discount: order.discount,
    promoCode: order.promoCode || null,
    paid: true,
    customer: {
      name: order.customerName,
      phone: decryptField(order.phone),
      email: to,
      address: decryptField(order.address),
      comment: order.comment || null,
    },
    items,
  }).catch(() => {});

  return { order: done, alreadyPaid: false };
}

// Попытка оплаты протухла: возвращаем товар на склад, заказ помечаем «не
// оплачен». Сам заказ и его связь с промокодом остаются — покупатель может
// оплатить его повторно, продавец видит его в админке.
// Порядок важен: СНАЧАЛА снимаем с заказа признак «ждём оплату», и только потом
// возвращаем товар. Так уборка и отмена заказа покупателем не вернут один и тот
// же резерв дважды, столкнувшись в одну секунду (compare-and-set у PocketBase
// нет, поэтому окно гонки просто сжимаем до промежутка между чтением и
// записью). Если между записью и возвратом что-то упадёт, товар останется
// придержанным — это честнее, чем продать его дважды.
export async function failPendingOrder(
  pb: PocketBase,
  order: OrderRecord
): Promise<void> {
  await pb.collection("orders").update(order.id, {
    payment_status: "failed",
    pay_started_at: "",
  });
  await releaseOrderStock(pb, order.id);
}

// Вернуть в продажу товар, придержанный за заказом.
export async function releaseOrderStock(
  pb: PocketBase,
  orderId: string
): Promise<void> {
  const lines = await orderLines(pb, orderId);
  const release = lines
    .filter((l) => l.product)
    .map((l) => ({ productId: l.product, qty: l.qty }));
  if (release.length > 0) await releaseStock(pb, release);
}

export type PaymentAttempt =
  | { ok: true; invoiceId: number; order: OrderRecord; lines: OrderLine[] }
  | { ok: false; error: string; status: number };

// Начало (или повтор) оплаты заказа: выдаём НОВЫЙ номер счёта и, если резерв
// был снят, снова придерживаем товар.
//
// Новый номер нужен потому, что прежний счёт мог протухнуть по ExpirationDate,
// а Robokassa не даёт оплатить просроченный счёт. Старый номер при этом
// перестаёт что-либо значить: уведомление по нему уже не найдёт заказ, и это
// правильно — платили по новому.
export async function startPaymentAttempt(
  pb: PocketBase,
  orderId: string
): Promise<PaymentAttempt> {
  const rec = await pb
    .collection("orders")
    .getOne(orderId)
    .catch(() => null);
  if (!rec) return { ok: false, error: "Заказ не найден", status: 404 };
  const order = toOrderRecord(rec as unknown as Record<string, unknown>);

  if (order.paymentStatus === "paid") {
    return { ok: false, error: "Заказ уже оплачен", status: 409 };
  }
  if (order.paymentStatus === "refunded") {
    return { ok: false, error: "По заказу оформлен возврат", status: 409 };
  }
  if (order.paymentStatus === "unpaid") {
    return {
      ok: false,
      error: "Этот заказ оформлен без онлайн-оплаты",
      status: 409,
    };
  }
  // Покупатель сам отменил заказ (или это сделал продавец) — платить нечего.
  if (order.status === "cancelled") {
    return { ok: false, error: "Заказ отменён", status: 409 };
  }

  const lines = await orderLines(pb, order.id);
  if (lines.length === 0) {
    return { ok: false, error: "В заказе нет позиций", status: 409 };
  }

  // Резерв возвращаем только тем заказам, у которых его сняли (failed).
  // У pending товар всё ещё придержан — второй раз списывать нельзя.
  if (order.paymentStatus === "failed") {
    const reserve = lines
      .filter((l) => l.product)
      .map((l) => ({ productId: l.product, qty: l.qty }));
    if (reserve.length > 0 && (await reserveStock(pb, reserve)) === "conflict") {
      return {
        ok: false,
        error:
          "Товар из заказа разобрали, пока он ждал оплаты. Напишите нам — подберём замену или вернём заказ в работу.",
        status: 409,
      };
    }
  }

  const invoiceId = await nextInvoiceId(pb);
  try {
    await pb.collection("orders").update(order.id, {
      invoice_id: invoiceId,
      payment_status: "pending",
      pay_started_at: new Date().toISOString(),
    });
  } catch {
    return {
      ok: false,
      error: "Не удалось выставить счёт — попробуйте ещё раз",
      status: 503,
    };
  }

  return { ok: true, invoiceId, order, lines };
}

// Письмо «заказ принят». Для онлайн-оплаты уходит сразу при оформлении: заказ
// уже в базе, у покупателя на руках номер, даже если оплату он не завершил.
export async function mailOrderAccepted(
  order: CreatedOrder,
  payload: OrderPayload,
  opts: { awaitingPayment: boolean }
): Promise<void> {
  const to = decryptField(payload.email);
  if (!to) return;
  await mailOrderPlaced(
    { to, number: order.number, name: payload.customer_name },
    payload.items.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
    {
      total: payload.total,
      deliveryCost: payload.delivery_cost,
      deliveryMethod: payload.delivery_method,
      discount: payload.discount,
      promoCode: payload.discount > 0 ? payload.promo_code || null : null,
      awaitingPayment: opts.awaitingPayment,
    }
  );
}
