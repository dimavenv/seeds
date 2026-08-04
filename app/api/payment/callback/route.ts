import { NextResponse } from "next/server";
import { pbAdmin } from "@/lib/pb/server";
import { findPaymentDraft, materializePaidOrder } from "@/lib/order-draft";
import {
  checkResultNotification,
  isRobokassaConfigured,
  isPaidState,
  paramsToObject,
  robokassaOpState,
} from "@/lib/robokassa";

export const dynamic = "force-dynamic";

// Result URL — уведомление об оплате от Robokassa (сервер-сервер).
// В ЛК Robokassa: Мои магазины → Технические настройки →
//   Result URL: https://tomatsemena.ru/api/payment/callback, метод POST
//   (метод GET тоже поддержан — на случай, если в настройках выбран он).
//
// Подпись считается Паролем#2 по строке «OutSum:InvId:Пароль#2» (плюс
// Shp_-параметры, если они есть). Пароль#2 знают только Robokassa и сайт —
// сошедшаяся подпись и есть доказательство подлинности уведомления.
//
// Именно здесь заказ И СОЗДАЁТСЯ: до оплаты в базе лежит только черновик
// (payment_drafts), в админке его нет. Так неоплаченная попытка не оставляет
// после себя ни «пустышки» в заказах, ни дырки в нумерации.
//
// В ответ Robokassa ждёт ровно «OK<номер счёта>» (например, OK1024). Любой
// другой ответ она считает недоставленным уведомлением и повторяет попытку —
// поэтому OK отдаём только тогда, когда заказ действительно создан.
async function handle(params: Record<string, string>): Promise<NextResponse> {
  const text = (body: string, status = 200) =>
    new NextResponse(body, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  if (!isRobokassaConfigured()) {
    // Оплата не подключена — уведомлению взяться неоткуда, отвечаем нейтрально.
    console.error("[robokassa] Result URL вызван, но онлайн-оплата не настроена");
    return text("payment disabled", 503);
  }

  const check = checkResultNotification(params);
  if (!check.ok) {
    console.error(`[robokassa] Result URL: ${check.reason}`);
    return text("bad signature", 400);
  }
  const { invId, outSum } = check;

  let pb: Awaited<ReturnType<typeof pbAdmin>>;
  try {
    pb = await pbAdmin();
  } catch (e) {
    // База недоступна — отвечаем ошибкой, чтобы Robokassa повторила уведомление.
    console.error(`[robokassa] счёт ${invId}: база недоступна:`, e);
    return text("db unavailable", 503);
  }

  // Заказ уже создан (повторное уведомление или покупатель успел вернуться на
  // Success URL) — повторять нечего.
  const existing = await pb
    .collection("orders")
    .getFirstListItem(pb.filter("invoice_id = {:inv}", { inv: invId }))
    .catch(() => null);
  if (existing) return text(`OK${invId}`);

  const draft = await findPaymentDraft(pb, invId);
  if (!draft) {
    // Черновика нет: либо номер счёта чужой, либо черновик успели убрать как
    // протухший, а оплата всё-таки прошла. Деньги при этом списаны, поэтому
    // кричим в лог: повторы Robokassa и пометка «уведомление не доставлено» в
    // ЛК — сигнал разобраться вручную.
    console.error(
      `[robokassa] счёт ${invId} на ${outSum} ₽ оплачен, но черновик заказа не найден!`
    );
    return text("draft not found", 404);
  }

  // Сумма обязана совпасть до копейки: подпись подтверждает подлинность
  // уведомления, а эта проверка — что оплачено именно то, что мы выставили.
  if (Math.abs(outSum - draft.payload.total) > 0.005) {
    console.error(
      `[robokassa] счёт ${invId}: сумма уведомления ${outSum} ₽ не совпадает с суммой заказа ${draft.payload.total} ₽ — заказ не создан`
    );
    return text("amount mismatch", 400);
  }

  // Дополнительная сверка с Robokassa напрямую (XML OpStateExt). Если сервис
  // ответил и говорит, что деньги НЕ получены, — заказ не создаём. Если сервис
  // недоступен, полагаемся на подпись: подделать её без Пароля#2 нельзя, а
  // сумму мы уже проверили.
  try {
    const state = await robokassaOpState(invId);
    if (state.resultCode === 0 && !isPaidState(state)) {
      console.error(
        `[robokassa] счёт ${invId}: Robokassa сообщает состояние ${state.stateCode} — заказ не создан`
      );
      return text("not paid yet", 409);
    }
  } catch {
    console.error(
      `[robokassa] счёт ${invId}: состояние операции не проверено (сервис недоступен) — доверяем подписи уведомления`
    );
  }

  try {
    // Заказ создаётся здесь: с составом, статусом «оплачен» и письмами
    // покупателю и продавцу. Остатки не трогаем — товар списан при оформлении.
    const result = await materializePaidOrder(pb, invId);
    if (!result) {
      console.error(`[robokassa] счёт ${invId}: заказ не создан — черновик исчез`);
      return text("draft not found", 404);
    }
    return text(`OK${invId}`);
  } catch (e) {
    // Не смогли создать — отвечаем ошибкой, Robokassa повторит уведомление.
    console.error(`[robokassa] счёт ${invId}: не удалось создать заказ:`, e);
    return text("order create failed", 503);
  }
}

export async function POST(req: Request) {
  let params: Record<string, string> = {};
  try {
    // Robokassa шлёт обычную форму; параметры могут прийти и в строке запроса.
    const form = await req.formData();
    params = {
      ...paramsToObject(new URL(req.url).searchParams),
      ...paramsToObject(form),
    };
  } catch {
    params = paramsToObject(new URL(req.url).searchParams);
  }
  return handle(params);
}

export async function GET(req: Request) {
  return handle(paramsToObject(new URL(req.url).searchParams));
}
