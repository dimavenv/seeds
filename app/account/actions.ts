"use server";

import { revalidatePath } from "next/cache";
import { pbAdmin } from "@/lib/pb/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId } from "@/lib/data";
import { notifyNewReview } from "@/lib/admin-mail";

export type ReviewFormState = { error?: string; ok?: boolean };

// Отзыв о конкретном сорте — со страницы товара.
//
// Право оставить отзыв проверяется ровно так же, как для отзыва о заказе:
// нужен вход и полученный заказ, в котором этот сорт действительно был.
// Открытая форма «для всех» здесь была бы дырой: отзывы формируют рейтинг в
// поисковой выдаче, поэтому это первая мишень для накрутки. Проверка идёт
// ЧЕРЕЗ КЛИЕНТ ПОЛЬЗОВАТЕЛЯ: правила PocketBase отдают ему только его
// собственные позиции заказов, так что чужой заказ подставить нельзя.
export async function submitProductReview(input: {
  productId: string;
  rating: number;
  text: string;
  authorName: string;
}): Promise<ReviewFormState> {
  const { session, pb } = await getSessionPb();
  if (!session.userId) return { error: "Войдите, чтобы оставить отзыв" };
  if (!isValidRecordId(input.productId)) return { error: "Товар не найден" };

  const rating = Math.min(5, Math.max(1, Math.round(input.rating || 0)));
  const text = (input.text || "").trim();
  if (!rating) return { error: "Поставьте оценку" };
  if (!text) return { error: "Напишите текст отзыва" };

  // Ищем позицию заказа с этим товаром в полученном заказе покупателя.
  let orderId: string | null = null;
  let customerName = "";
  try {
    const items = await pb.collection("order_items").getList(1, 1, {
      filter: pb.filter(
        'product = {:product} && (order.status = "shipped" || order.status = "done")',
        { product: input.productId }
      ),
      expand: "order",
      sort: "-created",
    });
    const item = items.items[0];
    if (item) {
      orderId = String(item.order ?? "") || null;
      const order = item.expand?.order as { customer_name?: string } | undefined;
      customerName = String(order?.customer_name ?? "");
    }
  } catch {
    return { error: "Не удалось проверить заказ" };
  }
  if (!orderId)
    return { error: "Отзыв о сорте можно оставить после получения заказа с ним" };

  // Один отзыв на сорт от покупателя — иначе один человек накрутит рейтинг
  // повторными отправками.
  const existing = await pb
    .collection("reviews")
    .getList(1, 1, {
      filter: pb.filter("product = {:product} && user = {:user}", {
        product: input.productId,
        user: session.userId,
      }),
    })
    .catch(() => null);
  if (existing && existing.items.length > 0)
    return { error: "Вы уже оставили отзыв на этот сорт" };

  const authorName = (input.authorName || customerName || "Покупатель")
    .trim()
    .slice(0, 80);
  let productSlug = "";
  try {
    const admin = await pbAdmin();
    await admin.collection("reviews").create({
      user: session.userId,
      order: orderId,
      product: input.productId,
      author_name: authorName,
      rating,
      text: text.slice(0, 2000),
      // Та же модерация, что и у отзывов о магазине: до одобрения отзыв не
      // виден и в рейтинг сорта не входит.
      status: "pending",
      published_at: new Date().toISOString(),
    });
    const product = await admin
      .collection("products")
      .getOne(input.productId)
      .catch(() => null);
    productSlug = String(product?.slug ?? "");
  } catch {
    return { error: "Не удалось отправить отзыв" };
  }

  void notifyNewReview({
    author: authorName,
    rating,
    text: text.slice(0, 2000),
    orderNumber: null,
  }).catch(() => {});

  if (productSlug) revalidatePath(`/product/${productSlug}`);
  return { ok: true };
}

// Оставить отзыв к своему заказу (после получения). Уходит на модерацию.
export async function submitReview(input: {
  orderId: string;
  rating: number;
  text: string;
  authorName: string;
}): Promise<ReviewFormState> {
  const { session, pb } = await getSessionPb();
  if (!session.userId) return { error: "Войдите, чтобы оставить отзыв" };
  if (!isValidRecordId(input.orderId)) return { error: "Заказ не найден" };

  const rating = Math.min(5, Math.max(1, Math.round(input.rating || 0)));
  const text = (input.text || "").trim();
  if (!rating) return { error: "Поставьте оценку" };
  if (!text) return { error: "Напишите текст отзыва" };

  // Заказ должен принадлежать пользователю (правила доступа дают видеть только
  // свои) и быть отправлен/получен.
  let order: { id: string; number: number; status: string; customer_name: string };
  try {
    const rec = await pb.collection("orders").getOne(input.orderId);
    order = {
      id: rec.id,
      number: Number(rec.number ?? 0),
      status: String(rec.status),
      customer_name: String(rec.customer_name ?? ""),
    };
  } catch {
    return { error: "Заказ не найден" };
  }
  if (!["shipped", "done"].includes(order.status))
    return { error: "Отзыв можно оставить после получения заказа" };

  // Один отзыв на заказ.
  const existing = await pb
    .collection("reviews")
    .getList(1, 1, {
      filter: pb.filter("order = {:order} && user = {:user}", {
        order: order.id,
        user: session.userId,
      }),
    })
    .catch(() => null);
  if (existing && existing.items.length > 0)
    return { error: "Вы уже оставили отзыв на этот заказ" };

  // Создание — суперпользователем (прямое создание отзывов закрыто правилами).
  const authorName = (input.authorName || order.customer_name || "Покупатель")
    .trim()
    .slice(0, 80);
  try {
    const admin = await pbAdmin();
    await admin.collection("reviews").create({
      user: session.userId,
      order: order.id,
      author_name: authorName,
      rating,
      text: text.slice(0, 2000),
      status: "pending",
      published_at: new Date().toISOString(),
    });
  } catch {
    return { error: "Не удалось отправить отзыв" };
  }

  // Продавцу «у вас новый отзыв» — чтобы модерация не залёживалась.
  void notifyNewReview({
    author: authorName,
    rating,
    text: text.slice(0, 2000),
    orderNumber: order.number || null,
  }).catch(() => {});

  revalidatePath(`/account/orders/${input.orderId}`);
  return { ok: true };
}
