import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pbAdmin } from "@/lib/pb/server";
import { decryptField } from "@/lib/crypto";
import { mailPayment } from "@/lib/order-mail";

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
      const next =
        status === "1" && (operation === "deposited" || operation === "approved")
          ? "paid"
          : operation === "reversed" || operation === "refunded"
          ? "refunded"
          : operation === "declinedByTimeout" || status === "0"
          ? "failed"
          : null;

      if (next) {
        const prev = await pb.collection("orders").getOne(orderNumber);
        if (prev.payment_status !== next) {
          const rec = await pb
            .collection("orders")
            .update(orderNumber, { payment_status: next });
          // Чек по 54-ФЗ шлёт банк («Фискализация» в ЛК Альфы) — кассу здесь
          // вызывать не нужно. Письмо — только при реальной смене статуса
          // (Альфа может повторять callback; возврат из админки шлёт своё).
          if (next === "paid" || next === "refunded") {
            void mailPayment(
              {
                to: decryptField(rec.email as string | null),
                number: Number(rec.number),
                name: rec.customer_name as string | null,
              },
              next,
              next === "paid" ? Number(rec.total ?? 0) || undefined : undefined
            ).catch(() => {});
          }
        }
      }
    } catch {
      // Не смогли обновить — Альфа повторит callback; отвечаем 200, чтобы не копить.
    }
  }

  return new NextResponse("OK"); // обязательно 200, иначе Альфа шлёт повторы
}
