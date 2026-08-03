import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import {
  checkSuccessNotification,
  isRobokassaConfigured,
  paramsToObject,
  pick,
} from "@/lib/robokassa";

export const dynamic = "force-dynamic";

// Success URL — сюда Robokassa возвращает покупателя после успешной оплаты.
// В ЛК Robokassa: Технические настройки → Success URL:
//   https://tomatsemena.ru/payment/success (метод GET или POST — оба работают).
//
// Это переход из браузера, поэтому сам факт «пришли на этот адрес» ничего не
// доказывает: адрес может открыть кто угодно. Доверять можно только подписи —
// её Robokassa считает Паролем#1 по строке «OutSum:InvId:Пароль#1». Деньги
// заказу проставляет не этот роут, а Result URL (/api/payment/callback);
// здесь мы лишь показываем покупателю нужную страницу, чистим корзину и
// засчитываем цель «покупка» в Метрике — всё это только при верной подписи.
function redirectTo(path: string): NextResponse {
  // 303: после POST-возврата браузер должен перейти на страницу заказа
  // обычным GET, иначе обновление страницы повторит POST.
  return NextResponse.redirect(absoluteUrl(path), 303);
}

function handle(params: Record<string, string>): NextResponse {
  const invIdRaw = (pick(params, "InvId") ?? "").trim();
  const invId = Number(invIdRaw);
  const order = Number.isInteger(invId) && invId > 0 ? invId : null;

  if (!isRobokassaConfigured()) return redirectTo("/");
  if (order === null) {
    console.error("[robokassa] Success URL без номера счёта");
    return redirectTo("/");
  }

  const check = checkSuccessNotification(params);
  if (!check.ok) {
    // Подпись не сошлась — оплату не подтверждаем: показываем страницу заказа
    // без «оплачено» (корзина не чистится, цель в Метрике не засчитывается).
    console.error(`[robokassa] Success URL счёт ${order}: ${check.reason}`);
    return redirectTo(`/order/${order}`);
  }

  const qs = new URLSearchParams({ paid: "1", total: String(check.outSum) });
  return redirectTo(`/order/${order}?${qs.toString()}`);
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
