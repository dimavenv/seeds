import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { materializePaidOrder } from "@/lib/order-draft";
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
// Обычно заказ к этому моменту уже создан уведомлением Result URL. Но порядок
// не гарантирован, поэтому при верной подписи роут и сам умеет создать заказ
// из черновика — предварительно спросив у Robokassa, что деньги получены.
// Создание идемпотентно (уникальный invoice_id), гонка с Result URL безопасна.
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

    // Заказ мог уже создать Result URL — тогда просто ведём на него.
    const existing = await pb
      .collection("orders")
      .getFirstListItem(pb.filter("invoice_id = {:inv}", { inv: invoice }))
      .catch(() => null);

    let number = existing ? Number(existing.number) : null;

    if (number === null) {
      // Уведомление ещё не дошло — проверяем оплату у Robokassa напрямую и
      // создаём заказ сами, чтобы покупатель сразу увидел номер.
      const state = await robokassaOpState(invoice);
      if (!isPaidState(state)) {
        console.error(
          `[robokassa] Success URL счёт ${invoice}: подпись верна, но Robokassa не подтверждает оплату (состояние ${state.stateCode})`
        );
        return redirectTo("/cart");
      }
      const result = await materializePaidOrder(pb, invoice);
      number = result ? result.order.number : null;
    }

    if (number === null) {
      // Черновик исчез (например, уборка успела раньше) — деньги при этом
      // получены, разбираться придётся вручную; покупателю честно говорим,
      // что оплата принята.
      console.error(
        `[robokassa] Success URL счёт ${invoice}: оплата есть, а черновик заказа не найден`
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
