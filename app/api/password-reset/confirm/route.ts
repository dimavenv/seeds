import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import { allowAttempt } from "@/lib/email-code";
import { isDbConfigured } from "@/lib/pb/shared";
import { hasAdminCredentials } from "@/lib/pb/server";
import {
  applyNewPassword,
  inspectPasswordToken,
  sendPasswordChangedEmail,
} from "@/lib/password-reset";
import { INVALID_RESET_LINK } from "@/lib/password-reset-token";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function GET(request: Request) {
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return response({ error: "Восстановление пароля временно недоступно" }, 503);
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const valid = await inspectPasswordToken(token).catch(() => null);
  if (!valid) return response({ error: INVALID_RESET_LINK }, 400);
  return response({ ok: true, purpose: valid.purpose });
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const ip = clientIp(request);
  if (!allowAttempt(`reset-confirm:${ip ?? "?"}`, 10, 10 * 60 * 1000)) {
    return response({ error: "Слишком много попыток — подождите несколько минут" }, 429);
  }

  let body: { token?: unknown; password?: unknown; passwordConfirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: "Некорректный запрос" }, 400);
  }
  const password = String(body.password ?? "");
  if (password.length < 8) return response({ error: "Пароль минимум 8 символов" }, 400);
  if (password.length > 72) return response({ error: "Пароль не должен быть длиннее 72 символов" }, 400);
  if (password !== String(body.passwordConfirm ?? "")) {
    return response({ error: "Пароли не совпадают" }, 400);
  }
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return response({ error: "Восстановление пароля временно недоступно" }, 503);
  }

  const result = await applyNewPassword(String(body.token ?? ""), password);
  if (!result.ok) return response({ error: result.error }, result.status);
  void sendPasswordChangedEmail(result.email).catch((error) => {
    console.error("[password-reset] уведомление о смене пароля не отправлено:", error);
  });
  return response({ ok: true });
}
