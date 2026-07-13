import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pbAdmin } from "@/lib/pb/server";

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
      if (status === "1" && (operation === "deposited" || operation === "approved")) {
        await pb.collection("orders").update(orderNumber, { payment_status: "paid" });
        // Чек по 54-ФЗ шлёт банк, если подключена «Фискализация» в ЛК Альфы —
        // отдельно вызывать кассу здесь не нужно.
      } else if (operation === "reversed" || operation === "refunded") {
        await pb.collection("orders").update(orderNumber, { payment_status: "refunded" });
      } else if (operation === "declinedByTimeout" || status === "0") {
        await pb.collection("orders").update(orderNumber, { payment_status: "failed" });
      }
    } catch {
      // Не смогли обновить — Альфа повторит callback; отвечаем 200, чтобы не копить.
    }
  }

  return new NextResponse("OK"); // обязательно 200, иначе Альфа шлёт повторы
}
