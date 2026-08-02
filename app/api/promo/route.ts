import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { getSession } from "@/lib/auth";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { normalizePromoCode } from "@/lib/promo";
import { checkPromo } from "@/lib/promo-server";
import { allowAttempt } from "@/lib/email-code";

export const dynamic = "force-dynamic";

// Проверка промокода из корзины. Отвечает только «есть такой код и вот какая
// по нему скидка» — сумму заказа здесь не считаем и ничего не резервируем:
// окончательное решение принимает /api/checkout (там же код закрепляется за
// аккаунтом). Этот запрос нужен интерфейсу, чтобы показать скидку заранее.
//
// Правила, важные для безопасности:
//  • ГОСТЮ всегда отвечаем «войдите в аккаунт» — независимо от того, верный
//    код или нет. Иначе неавторизованный перебор находил бы рабочие коды.
//  • Ограничение частоты — по IP и по аккаунту: перебор кодов должен упираться
//    в 429, а не в терпение.
//  • В ответ уходит КАНОНИЧЕСКИЙ код правила, а не введённая строка: ввод
//    покупателя в интерфейс не возвращаем.

const NEED_AUTH =
  "Промокод действует только для покупателей с аккаунтом. Войдите в свой аккаунт (или зарегистрируйтесь) и примените код ещё раз.";

export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!allowAttempt(`promo:${ip ?? "?"}`, 20, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Слишком много попыток — подождите пару минут" },
      { status: 429 }
    );
  }

  const code = normalizePromoCode(body.code);
  if (!code) {
    return NextResponse.json({ error: "Введите промокод" }, { status: 400 });
  }

  if (!isDbConfigured() || !hasAdminCredentials()) {
    return NextResponse.json(
      { error: "Промокоды временно недоступны" },
      { status: 503 }
    );
  }

  // 1) Вошёл ли покупатель. Проверяем ПЕРВЫМ делом — гостю не сообщаем даже
  //    того, существует ли введённый код.
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json(
      { error: "Не удалось проверить аккаунт — попробуйте ещё раз" },
      { status: 503 }
    );
  }
  if (!session.userId) {
    return NextResponse.json({ error: NEED_AUTH, needAuth: true }, { status: 401 });
  }

  if (!allowAttempt(`promo:user:${session.userId}`, 20, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Слишком много попыток — подождите пару минут" },
      { status: 429 }
    );
  }

  // 2) Все условия кода разом: существует ли, действует ли по срокам, не
  //    потрачен ли аккаунтом, не закончились ли применения. Сумму заказа сюда
  //    не передаём — в корзине она ещё не окончательная, порог проверит
  //    оформление по ценам из базы.
  let check;
  try {
    const pb = await pbAdmin();
    check = await checkPromo(pb, { code, userId: session.userId });
  } catch {
    return NextResponse.json(
      { error: "База не отвечает — попробуйте ещё раз" },
      { status: 503 }
    );
  }

  if (!check.ok) {
    return NextResponse.json(
      { error: check.error, ...(check.needAuth ? { needAuth: true } : {}) },
      { status: check.status }
    );
  }

  const { rule } = check;
  return NextResponse.json({
    ok: true,
    promo: {
      code: rule.code,
      percent: rule.percent,
      amount: rule.amount,
      minSubtotal: rule.minSubtotal,
      label: rule.label,
    },
  });
}
