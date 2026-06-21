"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

export type ReviewFormState = { error?: string; ok?: boolean };

// Оставить отзыв к своему заказу (после получения). Уходит на модерацию.
export async function submitReview(input: {
  orderId: number;
  rating: number;
  text: string;
  authorName: string;
}): Promise<ReviewFormState> {
  const session = await getSession();
  if (!session.userId) return { error: "Войдите, чтобы оставить отзыв" };

  const rating = Math.min(5, Math.max(1, Math.round(input.rating || 0)));
  const text = (input.text || "").trim();
  if (!rating) return { error: "Поставьте оценку" };
  if (!text) return { error: "Напишите текст отзыва" };

  const supabase = createClient();

  // Заказ должен принадлежать пользователю и быть отправлен/получен.
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, customer_name")
    .eq("id", input.orderId)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!order) return { error: "Заказ не найден" };
  if (!["shipped", "done"].includes(order.status))
    return { error: "Отзыв можно оставить после получения заказа" };

  // Один отзыв на заказ.
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", input.orderId)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (existing) return { error: "Вы уже оставили отзыв на этот заказ" };

  const { error } = await supabase.from("reviews").insert({
    user_id: session.userId,
    order_id: input.orderId,
    author_name: (input.authorName || order.customer_name || "Покупатель")
      .trim()
      .slice(0, 80),
    rating,
    text: text.slice(0, 2000),
    status: "pending",
  });
  if (error) return { error: "Не удалось отправить отзыв" };

  revalidatePath(`/account/orders/${input.orderId}`);
  return { ok: true };
}
