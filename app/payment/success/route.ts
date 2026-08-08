import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { findOrderByInvoice, markOrderPaid } from "@/lib/order-flow";
import {
  checkSuccessNotification,
  isRobokassaConfigured,
  isPaidState,
  paramsToObject,
  pick,
  robokassaOpState,
} from "@/lib/robokassa";

export const dynamic = "force-dynamic";

// Success URL — сюда Robokassa возвращает покупателя после успешной оплаты.
// В ЛК Robokassa: Технические настройки → Success URL:
//   https://tomatsemena.ru/payment/success (метод GET или POST — оба работают).
//
// Это переход из браузера, поэтому сам факт «пришли на этот адрес» ничего не
// доказывает: адрес может открыть кто угодно. Доверять можно только подписи —
// её Robokassa считает Паролем#1 по строке «OutSum:InvId:Пароль#1».
//
// Обычно оплату к этому моменту уже подтвердило уведомление Result URL. Но
// порядок не гарантирован, поэтому при верной подписи роут и сам умеет
// пометить заказ оплаченным — предварительно спросив у Robokassa, что деньги
// получены. Подтверждение идемпотентно, гонка с Result URL безопасна.
function redirectTo(path: string): NextResponse {
  // 303: после POST-возврата браузер должен перейти на страницу заказа
  // обычным GET, иначе обновление страницы повторит POST.
  return NextResponse.redirect(absoluteUrl(path), 303);
}

async function handle(params: Record<string, string>): Promise<NextResponse> {
  const invIdRaw = (pick(params, "InvId") ?? "").trim();
  const invId = Number(invIdRaw);
  const invoice = Number.isInteger(invId) && invId > 0 ? invId : null;

  if (!isRobokassaConfigured()) return redirectTo("/");
  if (invoice === null) {
    console.error("[robokassa] Success URL без номера счёта");
    return redirectTo("/");
  }

  const check = checkSuccessNotification(params);
  if (!check.ok) {
    // Подпись не сошлась — оплату не подтверждаем: ведём в корзину, ничего не
    // создаём и не чистим (цель «покупка» в Метрике тоже не засчитывается).
    console.error(`[robokassa] Success URL счёт ${invoice}: ${check.reason}`);
    return redirectTo("/cart");
  }

  if (!isDbConfigured() || !hasAdminCredentials()) return redirectTo("/");

  try {
    const pb = await pbAdmin();

    const existing = await findOrderByInvoice(pb, invoice);
    let number = existing ? existing.number : null;

    // Оплату мог уже подтвердить Result URL — тогда просто ведём на заказ.
    if (existing && existing.paymentStatus !== "paid" && existing.paymentStatus !== "refunded") {
      // Уведомление ещё не дошло — проверяем оплату у Robokassa напрямую и
      // подтверждаем сами, чтобы покупатель сразу увидел «оплачен».
      const state = await robokassaOpState(invoice);
      if (!isPaidState(state)) {
        console.error(
          `[robokassa] Success URL счёт ${invoice}: подпись верна, но Robokassa не подтверждает оплату (состояние ${state.stateCode})`
        );
        return redirectTo("/cart");
      }
      await markOrderPaid(pb, invoice);
    }

    if (number === null) {
      // Заказ по счёту не нашёлся (например, его удалили из админки) — деньги
      // при этом получены, разбираться придётся вручную; покупателю честно
      // говорим, что оплата принята.
      console.error(
        `[robokassa] Success URL счёт ${invoice}: оплата есть, а заказа с таким счётом нет`
      );
      return redirectTo(`/order/${invoice}?paid=1&pending=1&inv=${invoice}`);
    }

    const qs = new URLSearchParams({
      paid: "1",
      total: String(check.outSum),
      inv: String(invoice),
    });
    return redirectTo(`/order/${number}?${qs.toString()}`);
  } catch (e) {
    console.error(`[robokassa] Success URL счёт ${invoice}: сбой обработки:`, e);
    return redirectTo(`/order/${invoice}?paid=1&pending=1&inv=${invoice}`);
  }
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
