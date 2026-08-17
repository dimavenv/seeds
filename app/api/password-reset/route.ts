import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";
import { isMailConfigured } from "@/lib/email";
import {
  generateCode,
  issueTicket,
  allowAttempt,
  allowForEmail,
  ttlMs,
  readTicket,
  CODE_EMAILS_PER_ADDRESS,
  CODE_EMAIL_WINDOW_MS,
} from "@/lib/email-code";
import { isDbConfigured } from "@/lib/pb/shared";
import { hasAdminCredentials } from "@/lib/pb/server";
import { accountExists, sendResetEmail } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

// Шаг 1 сброса пароля: запрос кода на почту.
//
// Ответ ОДИНАКОВЫЙ для существующей и несуществующей почты — иначе страница
// сброса превращается в проверялку «а есть ли у вас аккаунт с таким адресом».
// Билет выдаётся всегда, но код в письмо уходит только настоящему владельцу;
// по «пустому» билету шаг 2 не пройдёт: код в нём случайный и никому не
// известен.
//
// Повторный запрос кода — этот же роут: прежние живые коды переносятся в новый
// билет (письма к mail.ru приходят с задержкой и не по порядку).
function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  // Запрос обязан прийти с нашей же страницы (см. lib/csrf.ts).
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  let body: { email?: unknown; captchaToken?: unknown; ticket?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return bad("Укажите email, на который зарегистрирован аккаунт");
  }

  const ip = clientIp(request);
  // Письма стоят денег и репутации отправителя: 5 запросов за 10 минут с IP.
  if (!allowAttempt(`reset:${ip ?? "?"}`, 5, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }
  // И счётчик на сам ящик: смена IP не должна давать возможность засыпать
  // чужой адрес письмами «восстановление пароля».
  if (!allowForEmail("reset", email, CODE_EMAILS_PER_ADDRESS, CODE_EMAIL_WINDOW_MS)) {
    return bad(
      "На этот адрес уже отправлено несколько писем — проверьте почту или попробуйте через час",
      429
    );
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

  if (!isMailConfigured()) {
    return bad(
      "Восстановление пароля недоступно: на сайте не настроена почта. Напишите нам — поможем вручную.",
      503
    );
  }
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return bad("Восстановление пароля временно недоступно", 503);
  }

  let exists = false;
  try {
    exists = await accountExists(email);
  } catch {
    return bad("База не отвечает — попробуйте ещё раз", 503);
  }

  const code = generateCode();
  if (exists && !(await sendResetEmail(email, code))) {
    return bad("Не удалось отправить письмо с кодом, попробуйте позже", 503);
  }

  // Повторный запрос: прежние коды остаются рабочими, пока не вышел их срок.
  const previous = readTicket(String(body.ticket ?? ""), "reset");
  return NextResponse.json({
    ticket: issueTicket(email, code, { previous, scope: "reset" }),
    expiresIn: Math.round(ttlMs() / 1000),
  });
}
