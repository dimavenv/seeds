import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";
import { allowAttempt } from "@/lib/email-code";
import { getSession } from "@/lib/auth";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured, isValidRecordId } from "@/lib/pb/shared";
import {
  findOrderByInvoice,
  orderLines,
  startPaymentAttempt,
  toOrderRecord,
} from "@/lib/order-flow";
import { decryptField } from "@/lib/crypto";
import {
  buildRobokassaPayment,
  invoiceTtlMinutes,
  isRobokassaConfigured,
} from "@/lib/robokassa";

export const dynamic = "force-dynamic";

// Повторная оплата заказа, который остался неоплаченным.
//
// Кто может платить:
//   • владелец аккаунта — по id заказа из личного кабинета;
//   • гость, только что вернувшийся с неудачной оплаты, — по номеру счёта
//     (invoice), который Robokassa передала на Fail URL. Номер счёта знает лишь
//     тот, кто этот заказ оформлял, а платить чужой заказ бессмысленно: деньги
//     уходят продавцу, а состав, адрес и телефон в ответе не раскрываются.
//
// Капча обязательна: без неё роут превращается в бесплатный генератор счетов.
function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  // Запрос обязан прийти с нашей же страницы (см. lib/csrf.ts).
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  let body: { orderId?: unknown; invoice?: unknown; captchaToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  if (!isRobokassaConfigured()) {
    return bad("Онлайн-оплата сейчас недоступна", 503);
  }
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return bad("Оплата временно недоступна", 503);
  }

  const ip = clientIp(request);
  if (!allowAttempt(`pay:${ip ?? "?"}`, 10, 5 * 60 * 1000)) {
    return bad("Слишком много попыток оплаты — подождите пару минут", 429);
  }
  if (
    !(await verifyCaptcha(
      typeof body.captchaToken === "string" ? body.captchaToken : "",
      ip,
      { failClosed: true }
    ))
  ) {
    return bad("Подтвердите, что вы не робот");
  }

  const pb = await pbAdmin().catch(() => null);
  if (!pb) return bad("База недоступна — попробуйте позже", 503);

  // ===== Чей это заказ =====
  let orderId: string | null = null;
  if (typeof body.orderId === "string" && isValidRecordId(body.orderId)) {
    const session = await getSession().catch(() => null);
    if (!session?.userId) return bad("Войдите, чтобы оплатить заказ", 401);
    const rec = await pb.collection("orders").getOne(body.orderId).catch(() => null);
    if (!rec) return bad("Заказ не найден", 404);
    const order = toOrderRecord(rec as unknown as Record<string, unknown>);
    if (order.user !== session.userId) return bad("Заказ не найден", 404);
    orderId = order.id;
  } else {
    const invoice = Number(body.invoice);
    if (!Number.isInteger(invoice) || invoice <= 0) {
      return bad("Заказ не найден", 404);
    }
    const order = await findOrderByInvoice(pb, invoice);
    // Счёт живёт до конца попытки: следующая попытка получает новый номер, и
    // старый перестаёт находиться (например, если вернуться «назад» к прежней
    // странице «оплата не прошла»).
    if (!order) {
      return bad(
        "Счёт устарел. Откройте заказ в личном кабинете — оплатить можно оттуда.",
        404
      );
    }
    // Гость платит только по ЖИВОЙ попытке. Когда она протухла, товар уже
    // вернулся в продажу, и продолжение по одному лишь номеру счёта означало
    // бы, что любой желающий может перебором номеров снова разложить товар по
    // «висящим» заказам. Владельцу аккаунта это по-прежнему доступно — там
    // заказ проверяется по хозяину, а не по номеру счёта.
    if (order.paymentStatus !== "pending") {
      return bad(
        order.paymentStatus === "paid"
          ? "Заказ уже оплачен"
          : "Время оплаты по этому счёту истекло. Войдите в личный кабинет или напишите нам — поможем оплатить заказ.",
        409
      );
    }
    orderId = order.id;
  }

  // ===== Новый счёт =====
  const attempt = await startPaymentAttempt(pb, orderId);
  if (!attempt.ok) return bad(attempt.error, attempt.status);

  const { order, invoiceId } = attempt;
  const lines = await orderLines(pb, order.id);
  const goods = lines.reduce((s, l) => s + l.price * l.qty, 0);

  try {
    const ttl = invoiceTtlMinutes();
    const payment = buildRobokassaPayment({
      invId: invoiceId,
      amount: order.total,
      description: `Заказ №${order.number} на ${lines.reduce((s, l) => s + l.qty, 0)} шт.`,
      email: decryptField(order.email) || null,
      lines: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
      // Доставка и скидка — как при оформлении, иначе чек не сойдётся с суммой
      // платежа. Стоимость доставки берём из заказа, а если её там нет
      // (старые заказы) — восстанавливаем из итога.
      deliveryCost: order.deliveryCost || Math.max(0, order.total - goods + order.discount),
      discount: order.discount,
      expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 60_000) : null,
    });
    return NextResponse.json({
      number: order.number,
      invoiceId,
      total: order.total,
      payment,
    });
  } catch (e) {
    console.error(`[robokassa] заказ №${order.number}: счёт не выставлен:`, e);
    return bad("Не удалось открыть оплату — попробуйте ещё раз", 502);
  }
}
