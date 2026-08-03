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
// страницу «оплата не прошла». Неоплаченный заказ уберёт уборка зависших
// заказов (lib/order-cleanup.ts), она же вернёт товар на склад и промокод.
// Корзина покупателя не тронута: её чистит только успешный возврат с оплаты.
function handle(params: Record<string, string>): NextResponse {
  const invId = Number((pick(params, "InvId") ?? "").trim());
  const path =
    Number.isInteger(invId) && invId > 0 ? `/order/${invId}?failed=1` : "/cart";
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
