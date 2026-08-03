import { NextResponse } from "next/server";
import { pbAdmin } from "@/lib/pb/server";
import { decryptField } from "@/lib/crypto";
import { mailPayment } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";
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
// В ответ Robokassa ждёт ровно «OK<номер счёта>» (например, OK1024). Любой
// другой ответ она считает недоставленным уведомлением и повторяет попытку —
// поэтому OK отдаём только тогда, когда заказ действительно обработан.
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

  let order: Record<string, unknown>;
  try {
    order = await pb
      .collection("orders")
      .getFirstListItem(pb.filter("number = {:n}", { n: invId }));
  } catch {
    // Заказа нет: либо номер чужой, либо заказ успели удалить как зависший
    // (счёт при этом протухает раньше уборки — см. lib/order-cleanup.ts).
    // Деньги при этом могли быть списаны, поэтому кричим в лог: повторы
    // Robokassa и пометка «уведомление не доставлено» в ЛК — сигнал разобраться.
    console.error(
      `[robokassa] счёт ${invId} на ${outSum} ₽ оплачен, но заказ с таким номером не найден!`
    );
    return text("order not found", 404);
  }

  const orderId = String(order.id);
  const total = Number(order.total ?? 0);
  const paymentStatus = String(order.payment_status ?? "");

  // Оплаченный заказ обрабатываем ровно один раз: Robokassa повторяет
  // уведомление, пока не получит OK, а покупатель мог ещё и зайти на
  // Success URL. Повтор — это просто «уже сделано».
  if (paymentStatus === "paid" || paymentStatus === "refunded") {
    return text(`OK${invId}`);
  }

  // Сумма обязана совпасть до копейки: подпись подтверждает подлинность
  // уведомления, а эта проверка — что оплачено именно то, что мы выставили.
  if (Math.abs(outSum - total) > 0.005) {
    console.error(
      `[robokassa] счёт ${invId}: сумма уведомления ${outSum} ₽ не совпадает с суммой заказа ${total} ₽ — статус «оплачен» не выставлен`
    );
    return text("amount mismatch", 400);
  }

  // Дополнительная сверка с Robokassa напрямую (XML OpStateExt). Если сервис
  // ответил и говорит, что деньги НЕ получены, — не помечаем оплаченным.
  // Если сервис недоступен, полагаемся на подпись: подделать её без Пароля#2
  // нельзя, а сумму мы уже проверили.
  try {
    const state = await robokassaOpState(invId);
    if (state.resultCode === 0 && !isPaidState(state)) {
      console.error(
        `[robokassa] счёт ${invId}: Robokassa сообщает состояние ${state.stateCode} — статус «оплачен» не выставлен`
      );
      return text("not paid yet", 409);
    }
  } catch {
    console.error(
      `[robokassa] счёт ${invId}: состояние операции не проверено (сервис недоступен) — доверяем подписи уведомления`
    );
  }

  let rec: Record<string, unknown>;
  try {
    rec = await pb
      .collection("orders")
      .update(orderId, { payment_status: "paid" });
  } catch (e) {
    console.error(`[robokassa] счёт ${invId}: не удалось пометить заказ оплаченным:`, e);
    return text("update failed", 503);
  }

  // Остатки здесь НЕ трогаем: товар списывается при оформлении заказа
  // (reserveStock в /api/checkout), а не в момент оплаты.
  // Чек по 54-ФЗ формирует Robokassa (фискализация в ЛК) — кассу здесь
  // вызывать не нужно.
  const items = await pb
    .collection("order_items")
    .getFullList({
      filter: pb.filter("order = {:id}", { id: orderId }),
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
    "paid",
    Number(rec.total ?? 0) || undefined,
    items
  ).catch(() => {});

  // Продавцу «у вас новый заказ»: при онлайн-оплате заказ считается
  // состоявшимся именно сейчас (неоплаченные удаляются уборкой).
  void notifyNewOrder({
    id: orderId,
    number: Number(rec.number),
    total: Number(rec.total ?? 0),
    deliveryCost: Number(rec.delivery_cost ?? 0),
    deliveryMethod: (rec.delivery_method as string | null) ?? null,
    discount: Number(rec.discount ?? 0),
    promoCode: (rec.promo_code as string | null) || null,
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

  return text(`OK${invId}`);
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
