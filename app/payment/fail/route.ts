import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import { paramsToObject, pick } from "@/lib/robokassa";

export const dynamic = "force-dynamic";

// Fail URL — сюда Robokassa возвращает покупателя, если оплата не прошла или
// он сам ушёл с платёжной страницы. В ЛК Robokassa: Технические настройки →
// Fail URL: https://tomatsemena.ru/payment/fail
//
// Подписи здесь нет (Robokassa её на Fail URL не передаёт), поэтому никаких
// изменений в базе этот роут не делает — только показывает покупателю
// страницу «оплата не прошла». Заказ при этом в базе есть (создаётся при
// оформлении со статусом «ожидает оплаты»), и на странице по номеру счёта
// доступна кнопка «Оплатить» — повторить попытку можно сразу. Если покупатель
// уйдёт совсем, уборка вернёт товар в продажу, а заказ останется помеченным
// «не оплачен» (lib/order-cleanup.ts). Корзина не тронута: её чистит только
// успешный возврат с оплаты.
function handle(params: Record<string, string>): NextResponse {
  const invId = Number((pick(params, "InvId") ?? "").trim());
  const path =
    Number.isInteger(invId) && invId > 0
      ? `/order/failed?failed=1&inv=${invId}`
      : "/order/failed?failed=1";
  return NextResponse.redirect(absoluteUrl(path), 303);
}

export async function GET(req: Request) {
  return handle(paramsToObject(new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    return handle({
      ...paramsToObject(new URL(req.url).searchParams),
      ...paramsToObject(form),
    });
  } catch {
    return handle(paramsToObject(new URL(req.url).searchParams));
  }
}
