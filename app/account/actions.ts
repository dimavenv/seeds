"use server";

import { revalidatePath } from "next/cache";
import { pbAdmin } from "@/lib/pb/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId } from "@/lib/data";
import { notifyNewReview } from "@/lib/admin-mail";
import { joinFullName, parseProfile, type Profile } from "@/lib/profile";
import { releaseOrderStock, toOrderRecord } from "@/lib/order-flow";
import { releasePromoUseByOrder } from "@/lib/promo-server";

export type ReviewFormState = { error?: string; ok?: boolean };
export type ProfileFormState = { error?: string; ok?: boolean };

// Отмена своего неоплаченного заказа.
//
// Заказ с онлайн-оплатой попадает в базу сразу при оформлении, поэтому в
// истории может висеть то, что покупатель уже передумал брать. Отменять можно
// только НЕОПЛАЧЕННЫЕ заказы: с оплаченными разбирается продавец (там возврат
// денег, а не отмена).
//
// Что делаем: возвращаем товар в продажу (если резерв ещё держится), возвращаем
// промокод покупателю и помечаем заказ отменённым. Сам заказ остаётся в базе —
// он виден и покупателю, и продавцу.
export async function cancelUnpaidOrder(
  orderId: string
): Promise<{ ok?: boolean; error?: string }> {
  const { session } = await getSessionPb();
  if (!session.userId) return { error: "Войдите, чтобы отменить заказ" };
  if (!isValidRecordId(orderId)) return { error: "Заказ не найден" };

  let pb: Awaited<ReturnType<typeof pbAdmin>>;
  try {
    pb = await pbAdmin();
  } catch {
    return { error: "База недоступна — попробуйте позже" };
  }

  const rec = await pb.collection("orders").getOne(orderId).catch(() => null);
  if (!rec) return { error: "Заказ не найден" };
  const order = toOrderRecord(rec as unknown as Record<string, unknown>);
  // Чужой заказ отменить нельзя — и «не ваш» наружу не сообщаем.
  if (order.user !== session.userId) return { error: "Заказ не найден" };

  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return { error: "Заказ уже оплачен — напишите нам, оформим возврат" };
  }
  if (order.status === "cancelled") return { ok: true };
  if (order.status !== "new" && order.status !== "processing") {
    return { error: "Заказ уже в работе — напишите нам" };
  }

  // Сначала помечаем заказ — и только потом возвращаем товар: иначе уборка,
  // подошедшая в ту же секунду, вернула бы тот же резерв во второй раз
  // (см. failPendingOrder).
  try {
    await pb.collection("orders").update(order.id, {
      status: "cancelled",
      // Больше не ждём денег: уборке этот заказ трогать незачем.
      payment_status: "failed",
      pay_started_at: "",
    });
  } catch {
    return { error: "Не удалось отменить заказ, попробуйте ещё раз" };
  }

  // Товар придержан только у «ожидает оплаты»: у протухшей попытки (failed)
  // резерв уже снят уборкой, второй раз возвращать нельзя.
  if (order.paymentStatus === "pending") await releaseOrderStock(pb, order.id);

  // Промокод возвращаем покупателю: на отменённом заказе он «сгорел» бы зря.
  await releasePromoUseByOrder(pb, order.id);

  revalidatePath("/account");
  revalidatePath(`/account/orders/${order.id}`);
  return { ok: true };
}

// Сохранение ФИО и телефона в личном кабинете. Пишем от имени самого
// пользователя (правило updateRule в PocketBase разрешает менять свою запись,
// пока в теле нет role) — суперпользователь тут не нужен.
export async function updateProfile(input: Profile): Promise<ProfileFormState> {
  const { session, pb } = await getSessionPb();
  if (!session.userId) return { error: "Войдите, чтобы изменить данные" };

  const parsed = parseProfile({ ...input });
  if (parsed.error) return { error: parsed.error };
  const profile = parsed.profile;

  try {
    await pb.collection("users").update(session.userId, {
      ...profile,
      // name — одна строка ФИО: ею подписаны отзывы и обращения в письмах.
      name: joinFullName(profile),
    });
  } catch (e) {
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    // Понятная подсказка вместо «не удалось», если на сервере ещё старая схема
    // без полей профиля.
    if (data && Object.keys(profile).some((f) => f in data)) {
      return {
        error:
          "База ещё не знает полей профиля — выполните «npm run db:schema» на сервере.",
      };
    }
    return { error: "Не удалось сохранить данные, попробуйте ещё раз" };
  }

  revalidatePath("/account");
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
