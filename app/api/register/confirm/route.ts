import { NextResponse } from "next/server";
import { readTicket, codeMatches, allowAttempt } from "@/lib/email-code";
import { parseRegInput, dbReady, createUser } from "@/lib/registration";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Шаг 2 регистрации: проверка кода из письма и создание аккаунта.
// Билет выдан только после капчи и проверки почты на шаге 1, поэтому здесь
// капча не нужна. Почта берётся ИЗ БИЛЕТА (подделать его нельзя) — подсунуть
// другой адрес после отправки кода не выйдет.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  // От перебора шестизначного кода: 10 попыток за 10 минут с IP.
  if (!allowAttempt(`confirm:${ip ?? "?"}`, 10, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }

  const ticket = readTicket(String(body.ticket ?? ""));
  if (!ticket) return bad("Сессия подтверждения не найдена — начните заново");
  if (ticket.expired) {
    return bad("Код устарел — запросите новый");
  }
  if (!codeMatches(ticket, String(body.code ?? ""))) {
    return bad("Неверный код, проверьте письмо");
  }

  const { input, error } = parseRegInput({ ...body, email: ticket.email });
  if (error) return bad(error);
  if (!dbReady()) return bad("Регистрация временно недоступна", 503);

  const res = await createUser(input, true); // почта подтверждена кодом
  if (!res.ok) return bad(res.error, res.status);
  return NextResponse.json({ ok: true });
}
