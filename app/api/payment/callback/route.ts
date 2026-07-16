import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pbAdmin } from "@/lib/pb/server";
import { decryptField } from "@/lib/crypto";
import { mailPayment } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";

export const dynamic = "force-dynamic";

// Callback от Альфа-Банка (симметричная подпись, HMAC-SHA256).
// В ЛК эквайринга: Настройки → Callback-уведомления → тип «Симметричная
// подпись» → сгенерировать токен → URL https://tomatsemena.ru/api/payment/callback
// Токен положить в ALFA_CALLBACK_TOKEN (.env.production).
//
// Алгоритм проверки: убрать checksum и sign_alias, отсортировать оставшиеся
// параметры по имени (прямой порядок), собрать строку «имя;значение;», посчитать
// HMAC-SHA256 общим токеном, перевести в верхний регистр, сравнить с checksum.
export async function GET(req: Request) {
  const token = process.env.ALFA_CALLBACK_TOKEN;
  const params = new URL(req.url).searchParams;

  // Callback не настроен — тихо отвечаем 200 (Альфа не будет копить повторы).
  if (!token) return new NextResponse("callback disabled", { status: 200 });

  const checksum = params.get("checksum") || "";
  const entries: [string, string][] = [];
  params.forEach((v, k) => {
    if (k !== "checksum" && k !== "sign_alias") entries.push([k, v]);
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const data = entries.map(([k, v]) => `${k};${v};`).join("");

  const hmac = crypto
    .createHmac("sha256", token)
    .update(data)
    .digest("hex")
    .toUpperCase();
  if (hmac !== checksum.toUpperCase()) {
    return new NextResponse("bad checksum", { status: 400 });
  }

  const operation = params.get("operation"); // approved|deposited|reversed|refunded|declinedByTimeout
  const status = params.get("status"); // 1 успех, 0 ошибка
  const orderNumber = params.get("orderNumber"); // = id записи заказа (мы так регистрировали)

  if (orderNumber) {
    try {
      const pb = await pbAdmin();
      const isPayment = operation === "deposited" || operation === "approved";
      const isRefund = operation === "reversed" || operation === "refunded";
      // ВАЖНО: возврат засчитываем только при status=1. Неудавшийся возврат
      // (например, на счёте магазина не хватило средств) приходит как
      // operation=refunded&status=0 — деньги остались у покупателя списанными,
      // заказ должен остаться «оплачен». И «failed» ставим только по операциям
      // ОПЛАТЫ: провал возврата не делает оплату неуспешной.
      const next =
        status === "1" && isPayment
          ? "paid"
          : status === "1" && isRefund
          ? "refunded"
          : operation === "declinedByTimeout" || (status === "0" && isPayment)
          ? "failed"
          : null;

      if (next === "failed") {
        // Оплата окончательно не прошла. Неоплаченный «свежий» заказ удаляем
        // целиком: корзина у покупателя осталась (мы её не чистим до оплаты),
        // а «пустышки» в админке не нужны. Заказ, который админ уже взял в
        // работу или который был оплачен, не трогаем.
        const prev = await pb.collection("orders").getOne(orderNumber);
        if (prev.status === "new" && (prev.payment_status === "pending" || prev.payment_status === "unpaid")) {
          for (const l of await pb
            .collection("order_items")
            .getFullList({ filter: pb.filter("order = {:id}", { id: orderNumber }), fields: "id" })
            .catch(() => [] as { id: string }[])) {
            await pb.collection("order_items").delete(l.id).catch(() => {});
          }
          await pb.collection("orders").delete(orderNumber);
        } else {
          await pb.collection("orders").update(orderNumber, { payment_status: "failed" });
        }
      } else if (next === "refunded") {
        // Возврат бывает частичным (из админки или из ЛК банка), а Альфа
        // повторяет callback'и — поэтому сверяемся с банком, сколько всего
        // возвращено, и закрываем заказ как «возврат» только когда возвращена
        // вся сумма. Идемпотентно: повторный callback ничего не ломает.
        const prev = await pb.collection("orders").getOne(orderNumber);
        const total = Number(prev.total ?? 0);
        let refunded: number | null = null; // рублей возвращено всего
        try {
          const { isAlfaConfigured, alfaStatus } = await import("@/lib/alfa");
          const alfaOrderId = String(prev.alfa_order_id ?? "");
          if (isAlfaConfigured() && alfaOrderId) {
            const st = await alfaStatus(alfaOrderId);
            const kop = st.paymentAmountInfo?.refundedAmount;
            if (typeof kop === "number") refunded = kop / 100;
          }
        } catch {
          /* статус недоступен — обработаем однозначные случаи по сумме ниже */
        }
        if (refunded === null) {
          // Без сверки засчитываем только однозначный ПОЛНЫЙ возврат (сумма
          // операции покрывает весь заказ); частичные фиксирует админка.
          const amountKop = Number(params.get("amount") ?? 0);
          if (amountKop >= Math.round(total * 100)) refunded = total;
        }
        if (refunded !== null && refunded > 0) {
          const full = refunded >= total - 0.005;
          const newAmount = Math.min(refunded, total);
          if (
            String(prev.payment_status) !== (full ? "refunded" : "paid") ||
            Number(prev.refunded_amount ?? 0) !== newAmount
          ) {
            const rec = await pb.collection("orders").update(orderNumber, {
              refunded_amount: newAmount,
              payment_status: full ? "refunded" : "paid",
            });
            // Письмо — только при переходе в полный возврат: частичный возврат
            // из админки шлёт своё письмо со списком возвращённых товаров.
            if (full && prev.payment_status !== "refunded") {
              void mailPayment(
                {
                  to: decryptField(rec.email as string | null),
                  number: Number(rec.number),
                  name: rec.customer_name as string | null,
                },
                "refunded",
                newAmount
              ).catch(() => {});
            }
          }
        }
      } else if (next) {
        const prev = await pb.collection("orders").getOne(orderNumber);
        if (prev.payment_status !== next) {
          const rec = await pb
            .collection("orders")
            .update(orderNumber, { payment_status: next });
          // Чек по 54-ФЗ шлёт банк («Фискализация» в ЛК Альфы) — кассу здесь
          // вызывать не нужно. Письмо — только при реальной смене статуса
          // (Альфа может повторять callback).
          if (next === "paid") {
            // Для письма об оплате — состав заказа (таблица в письме).
            const items = await pb
              .collection("order_items")
              .getFullList({
                filter: pb.filter("order = {:id}", { id: orderNumber }),
                fields: "name,price,qty",
              })
              .then((ls) =>
                ls.map((l) => ({
                  name: String(l.name),
                  price: Number(l.price),
                  qty: Number(l.qty),
                }))
              )
              .catch(() => undefined);
            void mailPayment(
              {
                to: decryptField(rec.email as string | null),
                number: Number(rec.number),
                name: rec.customer_name as string | null,
              },
              next,
              Number(rec.total ?? 0) || undefined,
              items
            ).catch(() => {});
            // Продавцу «у вас новый заказ»: при онлайн-оплате заказ считается
            // состоявшимся именно сейчас (неоплаченные удаляются, см. выше).
            void notifyNewOrder({
              id: orderNumber,
              number: Number(rec.number),
              total: Number(rec.total ?? 0),
              deliveryCost: Number(rec.delivery_cost ?? 0),
              deliveryMethod: (rec.delivery_method as string | null) ?? null,
              paid: true,
              customer: {
                name: String(rec.customer_name ?? ""),
                phone: decryptField(rec.phone as string | null),
                email: decryptField(rec.email as string | null),
                address: decryptField(rec.address as string | null),
                comment: (rec.comment as string | null) || null,
              },
              items: items ?? [],
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Не смогли обновить — Альфа повторит callback; отвечаем 200, чтобы не копить.
    }
  }

  return new NextResponse("OK"); // обязательно 200, иначе Альфа шлёт повторы
}
