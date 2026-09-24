import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";
import { isMailConfigured } from "@/lib/email";
import {
  allowAttempt,
  allowForEmail,
  CODE_EMAILS_PER_ADDRESS,
  CODE_EMAIL_WINDOW_MS,
} from "@/lib/email-code";
import { isDbConfigured } from "@/lib/pb/shared";
import { hasAdminCredentials, pbAdmin } from "@/lib/pb/server";
import {
  createPasswordLink,
  findAccountByEmail,
  revokePasswordLink,
  sendResetEmail,
} from "@/lib/password-reset";

export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  let body: { email?: unknown; captchaToken?: unknown };
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
  if (!allowAttempt(`reset:${ip ?? "?"}`, 5, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }
  if (!allowForEmail("reset", email, CODE_EMAILS_PER_ADDRESS, CODE_EMAIL_WINDOW_MS)) {
    return bad("На этот адрес уже отправлено несколько писем — попробуйте через час", 429);
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
    console.error("[password-reset] SMTP не настроен");
    return bad("Восстановление пароля временно недоступно. Напишите нам — поможем вручную.", 503);
  }
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return bad("Восстановление пароля временно недоступно", 503);
  }

  try {
    const account = await findAccountByEmail(email);
    if (account) {
      const pb = await pbAdmin();
      const link = await createPasswordLink(pb, account.id, "reset");
      if (!(await sendResetEmail(account.email, link.url))) {
        await revokePasswordLink(pb, link.recordId);
        console.error(`[password-reset] письмо для ${email} не отправлено`);
      }
    }
  } catch (error) {
    // Не раскрываем существование email; техническая причина остаётся в логе.
    console.error("[password-reset] запрос ссылки не выполнен:", error);
  }
  return NextResponse.json({ ok: true });
}
