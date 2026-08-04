import "server-only";
import type PocketBase from "pocketbase";
import { decryptField } from "@/lib/crypto";
import { releaseStock } from "@/lib/stock";
import { restoreUserCart } from "@/lib/user-cart";
import { releasePromoUse, attachPromoUseToOrder } from "@/lib/promo-server";
import { mailPayment } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";

// Черновики оплаты: заказ в базе появляется ТОЛЬКО после подтверждённой оплаты.
//
// Зачем так. Robokassa не присылает уведомлений о неудачных платежах: если бы
// сайт создавал заказ до перехода на оплату, каждая брошенная попытка оставляла
// бы «пустышку» в /admin/orders и дырку в нумерации. Поэтому всё, что нужно для
// заказа, складывается в отдельную коллекцию payment_drafts (в админке её
// нет), а настоящий заказ создаётся в момент, когда деньги подтверждены.
//
// Что при этом всё-таки делается заранее — резерв товара и промокода: иначе
// двое покупателей могли бы оплатить последний пакетик семян, и одному
// пришлось бы возвращать деньги. Резерв возвращается, когда черновик протухает
// (см. cleanupStalePaymentDrafts).
//
// Номер счёта в Robokassa (InvId) берётся из своей последовательности и живёт в
// черновике, а после оплаты записывается в заказ (orders.invoice_id) — по нему
// операция ищется в личном кабинете, и по нему же материализация заказа
// защищена от гонки (уникальный индекс).

export const DRAFTS_COLLECTION = "payment_drafts";

export type DraftItem = {
  product: string;
  name: string;
  price: number;
  qty: number;
};

// Всё, из чего потом собирается заказ. Персональные данные лежат здесь уже
// зашифрованными (тем же encryptField, что и в orders) — расшифровываются
// только для писем.
export type DraftPayload = {
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
  items: DraftItem[];
};

export type PaymentDraft = {
  id: string;
  invId: number;
  payload: DraftPayload;
  promoUseId: string | null;
  placedAt: string;
};

function toDraft(rec: Record<string, unknown>): PaymentDraft {
  const raw = rec.payload;
  const payload = (
    typeof raw === "string" ? JSON.parse(raw) : raw
  ) as DraftPayload;
  return {
    id: String(rec.id),
    invId: Number(rec.inv_id ?? 0),
    payload,
    promoUseId: (rec.promo_use as string | null) || null,
    placedAt: String(rec.placed_at ?? ""),
  };
}

// Следующий номер счёта. Считается от максимума и по черновикам, и по уже
// оплаченным заказам, чтобы номер не повторился после уборки черновиков.
export async function nextInvoiceId(pb: PocketBase): Promise<number> {
  const [drafts, orders] = await Promise.all([
    pb
      .collection(DRAFTS_COLLECTION)
      .getList(1, 1, { sort: "-inv_id", fields: "inv_id" })
      .catch(() => null),
    pb
      .collection("orders")
      .getList(1, 1, { sort: "-invoice_id", fields: "invoice_id" })
      .catch(() => null),
  ]);
  const maxDraft = Number(drafts?.items[0]?.inv_id ?? 0) || 0;
  const maxOrder = Number(orders?.items[0]?.invoice_id ?? 0) || 0;
  return Math.max(maxDraft, maxOrder) + 1;
}

// Создание черновика. При гонке за номер счёта (уникальный индекс) пробуем
// следующий — так же, как с номерами заказов.
export async function createPaymentDraft(
  pb: PocketBase,
  payload: DraftPayload,
  promoUseId: string | null
): Promise<PaymentDraft> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const invId = (await nextInvoiceId(pb)) + attempt;
      const rec = await pb.collection(DRAFTS_COLLECTION).create({
        inv_id: invId,
        payload,
        promo_use: promoUseId ?? "",
        placed_at: new Date().toISOString(),
      });
      return toDraft(rec);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("payment draft create failed");
}

export async function findPaymentDraft(
  pb: PocketBase,
  invId: number
): Promise<PaymentDraft | null> {
  try {
    const rec = await pb
      .collection(DRAFTS_COLLECTION)
      .getFirstListItem(pb.filter("inv_id = {:inv}", { inv: invId }));
    return toDraft(rec);
  } catch {
    return null;
  }
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

// Создание заказа со списком позиций из готовых данных. Используется и при
// оформлении без онлайн-оплаты, и при материализации оплаченного черновика.
export async function createOrderWithItems(
  pb: PocketBase,
  payload: DraftPayload,
  extra: { invoiceId?: number; paymentStatus: "unpaid" | "paid" }
): Promise<CreatedOrder> {
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
        user: payload.user,
        placed_at: new Date().toISOString(),
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

export type MaterializeResult = {
  order: CreatedOrder;
  // true — заказ создан этим вызовом (значит, письма шлём именно здесь).
  created: boolean;
};

// Превращение оплаченного черновика в заказ. Вызывается из трёх мест:
// уведомления об оплате (Result URL), возврата покупателя (Success URL) и
// уборки (если уведомление так и не дошло). Идемпотентно: заказ с таким
// invoice_id может существовать только один — это гарантирует уникальный
// индекс, а проигравший гонку просто перечитывает запись.
export async function materializePaidOrder(
  pb: PocketBase,
  invId: number
): Promise<MaterializeResult | null> {
  const existing = await pb
    .collection("orders")
    .getFirstListItem(pb.filter("invoice_id = {:inv}", { inv: invId }))
    .catch(() => null);
  if (existing) {
    return {
      order: { id: existing.id, number: Number(existing.number) },
      created: false,
    };
  }

  const draft = await findPaymentDraft(pb, invId);
  if (!draft) return null;

  let order: CreatedOrder;
  try {
    order = await createOrderWithItems(pb, draft.payload, {
      invoiceId: invId,
      paymentStatus: "paid",
    });
  } catch (e) {
    // Скорее всего, параллельный вызов успел создать заказ первым —
    // перечитываем и работаем с ним.
    const again = await pb
      .collection("orders")
      .getFirstListItem(pb.filter("invoice_id = {:inv}", { inv: invId }))
      .catch(() => null);
    if (!again) throw e;
    return {
      order: { id: again.id, number: Number(again.number) },
      created: false,
    };
  }

  // Промокод закрепляем за заказом: по этой связи он вернётся покупателю,
  // если заказ потом удалят.
  if (draft.promoUseId) {
    await attachPromoUseToOrder(pb, draft.promoUseId, order.id).catch(() => {});
  }
  // Черновик отработал — удаляем, чтобы уборка его не трогала.
  await pb.collection(DRAFTS_COLLECTION).delete(draft.id).catch(() => {});

  const p = draft.payload;
  const items = p.items.map((l) => ({
    name: l.name,
    price: l.price,
    qty: l.qty,
  }));
  const to = decryptField(p.email);

  void mailPayment(
    { to, number: order.number, name: p.customer_name },
    "paid",
    p.total,
    items
  ).catch(() => {});

  void notifyNewOrder({
    id: order.id,
    number: order.number,
    total: p.total,
    deliveryCost: p.delivery_cost,
    deliveryMethod: p.delivery_method || null,
    discount: p.discount,
    promoCode: p.promo_code || null,
    paid: true,
    customer: {
      name: p.customer_name,
      phone: decryptField(p.phone),
      email: to,
      address: decryptField(p.address),
      comment: p.comment || null,
    },
    items,
  }).catch(() => {});

  return { order, created: true };
}

// Отмена черновика: возвращаем товар на склад и промокод покупателю, состав
// вливаем обратно в серверную корзину вошедшего покупателя, черновик удаляем.
export async function releasePaymentDraft(
  pb: PocketBase,
  draft: PaymentDraft
): Promise<void> {
  const lines = draft.payload.items
    .filter((l) => l.product)
    .map((l) => ({ productId: l.product, qty: l.qty }));
  if (lines.length > 0) await releaseStock(pb, lines);
  if (draft.promoUseId) await releasePromoUse(pb, draft.promoUseId);
  if (draft.payload.user) {
    await restoreUserCart(pb, draft.payload.user, draft.payload.items);
  }
  await pb.collection(DRAFTS_COLLECTION).delete(draft.id).catch(() => {});
}
