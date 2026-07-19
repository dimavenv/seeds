"use server";

import { revalidatePath } from "next/cache";
import { pbAdmin } from "@/lib/pb/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId } from "@/lib/data";

export type ReviewFormState = { error?: string; ok?: boolean };

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
  let order: { id: string; status: string; customer_name: string };
  try {
    const rec = await pb.collection("orders").getOne(input.orderId);
    order = {
      id: rec.id,
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
  try {
    const admin = await pbAdmin();
    await admin.collection("reviews").create({
      user: session.userId,
      order: order.id,
      author_name: (input.authorName || order.customer_name || "Покупатель")
        .trim()
        .slice(0, 80),
      rating,
      text: text.slice(0, 2000),
      status: "pending",
      published_at: new Date().toISOString(),
    });
  } catch {
    return { error: "Не удалось отправить отзыв" };
  }

  revalidatePath(`/account/orders/${input.orderId}`);
  return { ok: true };
}
