"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { pbAdmin } from "@/lib/pb/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId } from "@/lib/data";
import { decryptField } from "@/lib/crypto";
import { mailOrderStatus, mailPayment, mailTracking } from "@/lib/order-mail";
import { slugify } from "@/lib/slug";
import { parseVariantMap, type ImageVariantMap } from "@/lib/image-variants";
import type { OrderStatus, ReviewStatus } from "@/lib/types";

// Данные заказа для письма покупателю (почта хранится зашифрованной).
async function orderMailInfo(id: string): Promise<{
  to: string | null;
  number: number;
  name: string | null;
  status: string;
  tracking: string | null;
  deliveryMethod: string | null;
} | null> {
  try {
    const pb = await pbAdmin();
    const rec = await pb.collection("orders").getOne(id);
    return {
      to: decryptField((rec.email as string | null) ?? null),
      number: Number(rec.number),
      name: (rec.customer_name as string | null) ?? null,
      status: String(rec.status ?? ""),
      tracking: (rec.tracking_number as string | null) ?? null,
      deliveryMethod: (rec.delivery_method as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

function errMessage(e: unknown): string {
  const data = (e as { response?: { data?: Record<string, { message?: string }> } })
    ?.response?.data;
  if (data) {
    const first = Object.entries(data)[0];
    if (first?.[1]?.message) return `${first[0]}: ${first[1].message}`;
  }
  return e instanceof Error ? e.message : "Не удалось сохранить";
}

export type ProductFormState = { error?: string; ok?: boolean };

export async function saveProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin) return { error: "Нет доступа" };

  const rawId = String(formData.get("id") ?? "");
  const id = isValidRecordId(rawId) ? rawId : null;
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  const rawCategory = String(formData.get("category_id") ?? "");
  const categoryId = isValidRecordId(rawCategory) ? rawCategory : "";
  const description = String(formData.get("description") ?? "").trim();
  // Несколько фото приходят JSON-массивом; image_url — первое (главное) фото.
  let images: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("images") ?? "[]"));
    if (Array.isArray(parsed)) {
      images = parsed.filter((u): u is string => typeof u === "string" && !!u.trim());
    }
  } catch {
    images = [];
  }
  // Карта облегчённых WebP-вариантов по каждому фото. Значение приходит из
  // формы уже собранным; parseVariantMap отсекает всё, что не похоже на
  // «оригинал → { ширина: адрес }», чтобы в базу не попал мусор.
  let imageVariants: ImageVariantMap = {};
  try {
    imageVariants = parseVariantMap(
      JSON.parse(String(formData.get("image_variants") ?? "{}"))
    );
  } catch {
    imageVariants = {};
  }
  const imageUrl = images[0] ?? "";
  const stock = Number(formData.get("stock") ?? 0);
  const seedsRaw = String(formData.get("seeds_per_pack") ?? "").trim();
  const seedsPerPack = seedsRaw ? Number(seedsRaw) : 0;
  const isNew = formData.get("is_new") === "on";
  const isFeatured = formData.get("is_featured") === "on";
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: "Укажите название" };
  // Числа проверяем явно: NaN/отрицательное раньше уходило в PocketBase как
  // есть (NaN сериализуется в null) и молча обнуляло цену или остаток.
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Укажите корректную цену (число не меньше 0)" };
  }
  if (!Number.isFinite(stock) || stock < 0) {
    return { error: "Некорректный остаток" };
  }
  if (!Number.isFinite(seedsPerPack) || seedsPerPack < 0) {
    return { error: "Некорректное число семян в пакетике" };
  }
  if (!slug) slug = slugify(name) || `tovar-${Date.now()}`;

  const payload = {
    name,
    slug,
    price,
    category: categoryId,
    description,
    image_url: imageUrl,
    images,
    image_variants: imageVariants,
    // В схеме PocketBase эти поля целочисленные (onlyInt).
    stock: Math.round(stock),
    seeds_per_pack: Math.round(seedsPerPack),
    is_new: isNew,
    is_featured: isFeatured,
  };

  try {
    if (id) await pb.collection("products").update(id, payload);
    else await pb.collection("products").create(payload);
  } catch (e) {
    return { error: errMessage(e) };
  }

  // Набор URL товаров изменился — сбрасываем кэш карты сайта (tag "products").
  revalidateTag("products");
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  return { ok: true };
}

export async function updateProductInline(
  id: string,
  fields: { price?: number; stock?: number }
): Promise<{ ok?: boolean; error?: string }> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin) return { error: "Нет доступа" };
  if (!isValidRecordId(id)) return { error: "Некорректный товар" };

  const payload: { price?: number; stock?: number } = {};
  if (typeof fields.price === "number" && !Number.isNaN(fields.price)) {
    payload.price = Math.max(0, fields.price);
  }
  if (typeof fields.stock === "number" && !Number.isNaN(fields.stock)) {
    payload.stock = Math.max(0, Math.round(fields.stock));
  }
  if (Object.keys(payload).length === 0) return { error: "Нечего сохранять" };

  try {
    await pb.collection("products").update(id, payload);
  } catch (e) {
    return { error: errMessage(e) };
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<void> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return;
  await pb.collection("products").delete(id).catch(() => {});
  revalidateTag("products"); // товар исчез из карты сайта
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<void> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return;
  const before = await orderMailInfo(id);
  try {
    await pb.collection("orders").update(id, { status });
  } catch {
    return;
  }
  // Письмо покупателю — только если статус реально сменился.
  if (before && before.status !== status) {
    void mailOrderStatus({ to: before.to, number: before.number, name: before.name }, status, {
      tracking: before.tracking,
      deliveryMethod: before.deliveryMethod,
    }).catch(() => {});
  }
  revalidatePath("/admin/orders");
}

export async function updateOrderTracking(
  id: string,
  tracking: string
): Promise<void> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return;
  const value = tracking.trim();
  const before = await orderMailInfo(id);
  try {
    await pb.collection("orders").update(id, { tracking_number: value });
  } catch {
    return;
  }
  // Трек вписали после отправки — покупатель уже получил письмо «отправлен»
  // без номера, досылаем номер отдельным письмом.
  if (before && value && value !== (before.tracking ?? "") && before.status === "shipped") {
    void mailTracking(
      { to: before.to, number: before.number, name: before.name },
      value,
      before.deliveryMethod
    ).catch(() => {});
  }
  revalidatePath("/admin/orders");
}

export async function updateVacationUntil(date: string | null): Promise<void> {
  const { session } = await getSessionPb();
  if (!session.isAdmin) return;
  const value = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  // Единственную запись настроек создаёт/правит суперпользователь — так работает
  // даже на свежей базе, где записи ещё нет.
  const pb = await pbAdmin();
  const page = await pb.collection("site_settings").getList(1, 1);
  if (page.items[0]) {
    await pb.collection("site_settings").update(page.items[0].id, { vacation_until: value });
  } else {
    await pb.collection("site_settings").create({ vacation_until: value });
  }
  // Дата отпуска кэшируется в unstable_cache (lib/data.ts) — сбрасываем по тегу,
  // иначе плашка меняется только через revalidate (до 10 минут).
  revalidateTag("site-settings");
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

// Что возвращаем: весь заказ (остаток, включая доставку) или выбранные товары.
export type RefundSelection =
  | { mode: "full" }
  | { mode: "items"; items: { id: string; qty: number }[] };

// Возврат оплаты через Альфа-Банк — полный или частичный (по товарам).
// Статус в базе меняется ТОЛЬКО после того, как банк принял возврат и
// подтвердил его в статусе платежа — иначе (нет денег на счёте, сеть упала)
// заказ остаётся «оплачен», а админ видит причину отказа.
export async function refundOrder(
  id: string,
  selection: RefundSelection = { mode: "full" }
): Promise<{ ok?: boolean; error?: string; refunded?: number; full?: boolean }> {
  const { session } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };

  const { isAlfaConfigured, alfaRefund, alfaStatus } = await import("@/lib/alfa");
  if (!isAlfaConfigured()) return { error: "Онлайн-оплата не подключена" };

  const pb = await pbAdmin();
  let order: {
    alfa_order_id: string;
    total: number;
    payment_status: string;
    refunded_amount: number;
  };
  let items: { id: string; name: string; price: number; qty: number; refunded_qty: number }[];
  try {
    const rec = await pb.collection("orders").getOne(id);
    order = {
      alfa_order_id: String(rec.alfa_order_id ?? ""),
      total: Number(rec.total ?? 0),
      payment_status: String(rec.payment_status ?? ""),
      refunded_amount: Number(rec.refunded_amount ?? 0),
    };
    items = (
      await pb
        .collection("order_items")
        .getFullList({ filter: pb.filter("order = {:id}", { id }) })
    ).map((l) => ({
      id: l.id,
      name: String(l.name ?? ""),
      price: Number(l.price ?? 0),
      qty: Number(l.qty ?? 0) || 1,
      refunded_qty: Number(l.refunded_qty ?? 0),
    }));
  } catch {
    return { error: "Заказ не найден" };
  }
  if (order.payment_status !== "paid") return { error: "Заказ не оплачен онлайн" };
  if (!order.alfa_order_id) return { error: "Нет идентификатора платежа" };

  // Остаток, который вообще можно вернуть по этому платежу.
  const remaining = Math.round((order.total - order.refunded_amount) * 100) / 100;
  if (remaining <= 0) return { error: "По заказу уже всё возвращено" };

  // Сумма возврата считается ТОЛЬКО по ценам из базы — клиенту не доверяем.
  let amount: number; // в рублях
  let refundedItems: { id: string; take: number; name: string; price: number; qty: number }[] = [];
  if (selection.mode === "items") {
    // Дубли одной позиции в выборке складываем, а не считаем дважды.
    const wanted = new Map<string, number>();
    for (const sel of selection.items) {
      wanted.set(sel.id, (wanted.get(sel.id) ?? 0) + Math.max(0, Math.floor(sel.qty)));
    }
    for (const it of items) {
      const req = wanted.get(it.id) ?? 0;
      if (req <= 0) continue;
      const take = Math.min(req, it.qty - it.refunded_qty);
      if (take > 0) refundedItems.push({ id: it.id, take, name: it.name, price: it.price, qty: it.qty });
    }
    amount = refundedItems.reduce((s, r) => s + r.price * r.take, 0);
    if (amount <= 0) return { error: "Не выбраны товары для возврата" };
    // Не больше остатка по платежу (например, если доставка уже возвращена).
    amount = Math.min(amount, remaining);
  } else {
    amount = remaining; // остаток целиком, включая доставку
    refundedItems = items
      .filter((it) => it.qty - it.refunded_qty > 0)
      .map((it) => ({ id: it.id, take: it.qty - it.refunded_qty, name: it.name, price: it.price, qty: it.qty }));
  }
  const amountKopecks = Math.round(amount * 100);

  let res: { errorCode?: string; errorMessage?: string };
  try {
    res = await alfaRefund(order.alfa_order_id, String(amountKopecks));
  } catch {
    return { error: "Банк недоступен — возврат не выполнен, попробуйте позже" };
  }
  if (res.errorCode && String(res.errorCode) !== "0") {
    return { error: res.errorMessage || "Банк отклонил возврат" };
  }

  // Банк ответил «ок» — сверяем со статусом платежа, что деньги действительно
  // ушли в возврат (при нехватке средств на счёте операция не проводится).
  try {
    const st = await alfaStatus(order.alfa_order_id);
    const refundedKopecks = st.paymentAmountInfo?.refundedAmount;
    if (
      typeof refundedKopecks === "number" &&
      refundedKopecks < Math.round(order.refunded_amount * 100) + amountKopecks
    ) {
      return {
        error:
          "Банк не подтвердил возврат — возможно, на счёте не хватает средств. Статус заказа не изменён.",
      };
    }
  } catch {
    // Статус недоступен, но refund.do прошёл — считаем возврат выполненным.
  }

  // Возврат подтверждён — фиксируем в базе. Остаток на склад автоматически НЕ
  // возвращаем (товар мог быть уже отгружён) — это ручное решение админа,
  // как и договаривались по возвратам/отменам.
  const newRefunded = Math.round((order.refunded_amount + amount) * 100) / 100;
  const full = newRefunded >= order.total - 0.005;
  for (const r of refundedItems) {
    const it = items.find((x) => x.id === r.id);
    await pb
      .collection("order_items")
      .update(r.id, { refunded_qty: (it?.refunded_qty ?? 0) + r.take })
      .catch(() => {});
  }
  await pb
    .collection("orders")
    .update(id, {
      refunded_amount: newRefunded,
      payment_status: full ? "refunded" : "paid",
    })
    .catch(() => {});

  const info = await orderMailInfo(id);
  if (info) {
    void mailPayment(
      { to: info.to, number: info.number, name: info.name },
      "refunded",
      amount,
      refundedItems.map((r) => ({ name: r.name, price: r.price, qty: r.take })),
      { partial: !full }
    ).catch(() => {});
  }
  revalidatePath("/admin/orders");
  revalidatePath("/account");
  return { ok: true, refunded: amount, full };
}

// Удаление тестового/мусорного заказа вместе с составом. Необратимо —
// подтверждение спрашивает клиентская кнопка.
export async function deleteOrder(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };
  try {
    const items = await pb.collection("order_items").getFullList({
      filter: pb.filter("order = {:id}", { id }),
    });
    for (const it of items) {
      await pb.collection("order_items").delete(it.id);
    }
    await pb.collection("orders").delete(id);
  } catch (e) {
    return { error: errMessage(e) };
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteReview(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };
  const slug = await reviewProductSlug(pb, id);
  try {
    await pb.collection("reviews").delete(id);
  } catch (e) {
    return { error: errMessage(e) };
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
  if (slug) revalidatePath(`/product/${slug}`);
  return { ok: true };
}

export async function deleteSupportRequest(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };
  try {
    await pb.collection("support_requests").delete(id);
  } catch (e) {
    return { error: errMessage(e) };
  }
  revalidatePath("/admin/support");
  return { ok: true };
}

// Ответ на заявку в поддержку: письмо уходит покупателю на почту из заявки,
// ответ сохраняется в базе (зашифрованным), заявка помечается «done».
// Порядок важен: сначала письмо, потом запись — если письмо не ушло,
// заявка остаётся без ответа и админ видит ошибку.
export async function replySupportRequest(
  id: string,
  reply: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };

  const text = reply.trim();
  if (!text) return { error: "Напишите текст ответа" };
  if (text.length > 5000) return { error: "Слишком длинный ответ (до 5000 символов)" };

  const { isMailConfigured } = await import("@/lib/email");
  if (!isMailConfigured()) {
    return { error: "Почта не настроена — заполните SMTP_* в .env.production" };
  }

  const pb = await pbAdmin();
  let req: { name: string; subject: string; email: string | null; message: string | null };
  try {
    const rec = await pb.collection("support_requests").getOne(id);
    req = {
      name: String(rec.name ?? ""),
      subject: String(rec.subject ?? ""),
      email: decryptField((rec.email as string | null) ?? null),
      message: decryptField((rec.message as string | null) ?? null),
    };
  } catch {
    return { error: "Заявка не найдена" };
  }
  if (!req.email) return { error: "В заявке нет почты для ответа" };

  const { mailSupportReply } = await import("@/lib/admin-mail");
  const sent = await mailSupportReply({
    to: req.email,
    name: req.name,
    subject: req.subject,
    question: req.message ?? "",
    reply: text,
  });
  if (!sent) {
    return { error: "Письмо не отправилось — проверьте почту: pm2 logs seeds (строки [mail])" };
  }

  const { encryptField } = await import("@/lib/crypto");
  await pb
    .collection("support_requests")
    .update(id, {
      reply: encryptField(text) ?? "",
      replied_at: new Date().toISOString(),
      status: "done",
    })
    .catch(() => {});
  revalidatePath("/admin/support");
  return { ok: true };
}

// Страница сорта, к которому привязан отзыв (если привязан). Нужна, чтобы
// после модерации пересобрать именно её: карточка живёт на ISR, и без сброса
// одобренный отзыв со звёздами и aggregateRating появился бы там только через
// час — а до тех пор видимый рейтинг и разметка расходились бы с базой.
async function reviewProductSlug(
  pb: Awaited<ReturnType<typeof getSessionPb>>["pb"],
  reviewId: string
): Promise<string | null> {
  try {
    const rec = await pb
      .collection("reviews")
      .getOne(reviewId, { expand: "product" });
    const product = rec.expand?.product as { slug?: string } | undefined;
    return product?.slug ? String(product.slug) : null;
  } catch {
    return null;
  }
}

export async function updateReviewStatus(
  id: string,
  status: ReviewStatus
): Promise<void> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return;
  // Слаг читаем ДО обновления: если отзыв затем удалят, связь уже не достать.
  const slug = await reviewProductSlug(pb, id);
  await pb.collection("reviews").update(id, { status }).catch(() => {});
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
  if (slug) revalidatePath(`/product/${slug}`);
}
