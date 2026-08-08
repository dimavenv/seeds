import { NextResponse } from "next/server";
import { pbAdmin } from "@/lib/pb/server";
import { findOrderByInvoice, markOrderPaid } from "@/lib/order-flow";
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
// Заказ к этому моменту уже в базе — он создаётся при оформлении со статусом
// «ожидает оплаты». Здесь статус меняется на «оплачен»: уходят письма
// покупателю и продавцу и, если покупатель был гостем, заводится аккаунт
// (см. lib/order-flow.ts).
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

  const order = await findOrderByInvoice(pb, invId);
  if (!order) {
    // Заказа с таким счётом нет: либо номер чужой, либо заказ удалили из
    // админки, а оплата всё-таки прошла. Деньги при этом списаны, поэтому
    // кричим в лог: повторы Robokassa и пометка «уведомление не доставлено» в
    // ЛК — сигнал разобраться вручную.
    console.error(
      `[robokassa] счёт ${invId} на ${outSum} ₽ оплачен, но заказа с таким счётом нет!`
    );
    return text("order not found", 404);
  }

  // Оплата уже подтверждена (повторное уведомление или покупатель успел
  // вернуться на Success URL) — повторять нечего.
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return text(`OK${invId}`);
  }

  // Сумма обязана совпасть до копейки: подпись подтверждает подлинность
  // уведомления, а эта проверка — что оплачено именно то, что мы выставили.
  if (Math.abs(outSum - order.total) > 0.005) {
    console.error(
      `[robokassa] счёт ${invId}: сумма уведомления ${outSum} ₽ не совпадает с суммой заказа №${order.number} (${order.total} ₽) — оплата не подтверждена`
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
        `[robokassa] счёт ${invId}: Robokassa сообщает состояние ${state.stateCode} — оплата не подтверждена`
      );
      return text("not paid yet", 409);
    }
  } catch {
    console.error(
      `[robokassa] счёт ${invId}: состояние операции не проверено (сервис недоступен) — доверяем подписи уведомления`
    );
  }

  try {
    // Статус «оплачен», письма покупателю и продавцу, аккаунт гостю. Остатки
    // не трогаем — товар списан при оформлении.
    const result = await markOrderPaid(pb, invId);
    if (!result) {
      console.error(`[robokassa] счёт ${invId}: заказ исчез между проверками`);
      return text("order not found", 404);
    }
    return text(`OK${invId}`);
  } catch (e) {
    // Не смогли записать — отвечаем ошибкой, Robokassa повторит уведомление.
    console.error(`[robokassa] счёт ${invId}: не удалось подтвердить оплату:`, e);
    return text("order update failed", 503);
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
