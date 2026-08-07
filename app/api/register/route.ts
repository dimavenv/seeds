import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";
import { isMailConfigured } from "@/lib/email";
import { generateCode, issueTicket, allowAttempt, ttlMs } from "@/lib/email-code";
import {
  parseRegInput,
  dbReady,
  emailTaken,
  createUser,
  sendCodeEmail,
  sendExistsEmail,
} from "@/lib/registration";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Шаг 1 регистрации. Проверки: российская почта, антибот-капча, email свободен.
// Если настроен SMTP — аккаунт НЕ создаётся сразу: на почту уходит 6-значный
// код, клиент получает «билет» и завершает регистрацию через
// /api/register/confirm. Без SMTP — прежнее поведение (создание сразу).
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const { input, error } = parseRegInput(body);
  if (error) return bad(error);

  const ip = clientIp(request);
  const human = await verifyCaptcha(String(body.captchaToken ?? ""), ip, {
    failClosed: true,
  });
  if (!human) return bad("Подтвердите, что вы не робот");

  if (!dbReady()) return bad("Регистрация временно недоступна", 503);

  // Почта не настроена (dev-режим) — аккаунт создаётся сразу, скрыть
  // существование адреса тут нельзя, поэтому сообщаем как есть.
  if (!isMailConfigured()) {
    try {
      if (await emailTaken(input.email)) {
        return bad("Такой email уже зарегистрирован");
      }
    } catch {
      return bad("Регистрация временно недоступна", 503);
    }
    const res = await createUser(input, false);
    if (!res.ok) return bad(res.error, res.status);
    return NextResponse.json({ ok: true });
  }

  // Не даём заваливать один IP письмами: 5 отправок за 10 минут.
  if (!allowAttempt(`start:${ip ?? "?"}`, 5, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }

  // Занятость адреса проверяем, но НАРУЖУ не показываем: и для свободной, и для
  // занятой почты отвечаем одинаково ({ needCode, ticket }). Разница лишь в
  // письме — код регистрации или «у вас уже есть аккаунт» (аудит 4.4). На
  // занятый адрес билет всё равно выдаётся, но код в письмо не уходит, поэтому
  // /api/register/confirm по нему аккаунт не создаст (проверка кода не пройдёт).
  let taken = false;
  try {
    taken = await emailTaken(input.email);
  } catch {
    return bad("Регистрация временно недоступна", 503);
  }

  // expiresIn — сколько секунд у покупателя есть на ввод; по нему страница
  // рисует обратный отсчёт, чтобы «код устарел» не было сюрпризом.
  const expiresIn = Math.round(ttlMs() / 1000);

  if (taken) {
    void sendExistsEmail(input.email, input.name).catch(() => {});
    return NextResponse.json({
      needCode: true,
      ticket: issueTicket(input.email, generateCode()),
      expiresIn,
    });
  }

  const code = generateCode();
  const sent = await sendCodeEmail(input.email, input.name, code);
  if (!sent) {
    return bad("Не удалось отправить письмо с кодом, попробуйте позже", 503);
  }
  return NextResponse.json({
    needCode: true,
    ticket: issueTicket(input.email, code),
    expiresIn,
  });
}
