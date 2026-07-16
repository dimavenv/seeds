"use server";

import { revalidatePath } from "next/cache";
import { pbAdmin } from "@/lib/pb/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId } from "@/lib/data";
import { decryptField } from "@/lib/crypto";
import { mailOrderStatus, mailPayment, mailTracking } from "@/lib/order-mail";
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

function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  return input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
  const price = Number(formData.get("price") ?? 0);
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
  const imageUrl = images[0] ?? "";
  const stock = Number(formData.get("stock") ?? 0);
  const seedsRaw = String(formData.get("seeds_per_pack") ?? "").trim();
  const seedsPerPack = seedsRaw ? Number(seedsRaw) : 0;
  const isNew = formData.get("is_new") === "on";
  const isFeatured = formData.get("is_featured") === "on";
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: "Укажите название" };
  if (!slug) slug = slugify(name) || `tovar-${Date.now()}`;

  const payload = {
    name,
    slug,
    price,
    category: categoryId,
    description,
    image_url: imageUrl,
    images,
    stock,
    seeds_per_pack: seedsPerPack,
    is_new: isNew,
    is_featured: isFeatured,
  };

  try {
    if (id) await pb.collection("products").update(id, payload);
    else await pb.collection("products").create(payload);
  } catch (e) {
    return { error: errMessage(e) };
  }

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
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

// Возврат оплаты через Альфа-Банк (полная сумма заказа).
export async function refundOrder(
  id: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return { error: "Нет доступа" };

  const { isAlfaConfigured, alfaRefund } = await import("@/lib/alfa");
  if (!isAlfaConfigured()) return { error: "Онлайн-оплата не подключена" };

  const pb = await pbAdmin();
  let order: { alfa_order_id: string; total: number; payment_status: string };
  try {
    const rec = await pb.collection("orders").getOne(id);
    order = {
      alfa_order_id: String(rec.alfa_order_id ?? ""),
      total: Number(rec.total ?? 0),
      payment_status: String(rec.payment_status ?? ""),
    };
  } catch {
    return { error: "Заказ не найден" };
  }
  if (order.payment_status !== "paid") return { error: "Заказ не оплачен онлайн" };
  if (!order.alfa_order_id) return { error: "Нет идентификатора платежа" };

  const res = await alfaRefund(
    order.alfa_order_id,
    String(Math.round(order.total * 100))
  );
  if (res.errorCode && res.errorCode !== "0") {
    return { error: res.errorMessage || "Банк отклонил возврат" };
  }

  await pb.collection("orders").update(id, { payment_status: "refunded" }).catch(() => {});
  const info = await orderMailInfo(id);
  if (info) {
    void mailPayment({ to: info.to, number: info.number, name: info.name }, "refunded").catch(
      () => {}
    );
  }
  revalidatePath("/admin/orders");
  return { ok: true };
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
  try {
    await pb.collection("reviews").delete(id);
  } catch (e) {
    return { error: errMessage(e) };
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
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

export async function updateReviewStatus(
  id: string,
  status: ReviewStatus
): Promise<void> {
  const { session, pb } = await getSessionPb();
  if (!session.isAdmin || !isValidRecordId(id)) return;
  await pb.collection("reviews").update(id, { status }).catch(() => {});
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
}
