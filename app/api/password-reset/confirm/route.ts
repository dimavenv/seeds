import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { readTicket, codeMatches, allowAttempt } from "@/lib/email-code";
import { isDbConfigured } from "@/lib/pb/shared";
import { hasAdminCredentials } from "@/lib/pb/server";
import { applyNewPassword, sendPasswordChangedEmail } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

// Шаг 2 сброса пароля: код из письма + новый пароль.
//
// Капча не нужна: билет доказывает, что шаг 1 с капчей уже пройден. Почта
// берётся ИЗ БИЛЕТА (подделать его нельзя) — подставить чужой адрес после
// получения кода не выйдет. Назначение билета тоже внутри: код от регистрации
// здесь не примут.
function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  let body: { ticket?: unknown; code?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const ip = clientIp(request);
  // От перебора шестизначного кода: 10 попыток за 10 минут с IP.
  if (!allowAttempt(`reset-confirm:${ip ?? "?"}`, 10, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }

  const ticket = readTicket(String(body.ticket ?? ""), "reset");
  if (!ticket) return bad("Сессия сброса не найдена — начните заново");
  if (ticket.expired) return bad("Код устарел — запросите новый");
  if (!codeMatches(ticket, String(body.code ?? ""))) {
    return bad("Неверный код, проверьте письмо");
  }

  const password = String(body.password ?? "");
  // Минимум как в схеме PocketBase (поле password, min 8).
  if (password.length < 8) return bad("Пароль минимум 8 символов");

  if (!isDbConfigured() || !hasAdminCredentials()) {
    return bad("Восстановление пароля временно недоступно", 503);
  }

  const res = await applyNewPassword(ticket.email, password);
  if (!res.ok) return bad(res.error, res.status);

  // Владельцу — уведомление о смене: если это был не он, он об этом узнает.
  void sendPasswordChangedEmail(ticket.email).catch(() => {});

  return NextResponse.json({ ok: true, email: ticket.email });
}
