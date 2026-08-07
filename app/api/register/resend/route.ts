import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import {
  readTicket,
  generateCode,
  issueTicket,
  allowAttempt,
  ttlMs,
} from "@/lib/email-code";
import { sendCodeEmail } from "@/lib/registration";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Повторная отправка кода. Капча не нужна: билет доказывает, что шаг 1 с капчей
// уже пройден. Код каждый раз новый, но прежние — пока не вышел их срок —
// продолжают работать (см. lib/email-code.ts: письма приходят с задержкой и не
// обязательно в том порядке, в каком мы их отправили).
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const ip = clientIp(request);
  if (!allowAttempt(`resend:${ip ?? "?"}`, 3, 5 * 60 * 1000)) {
    return bad("Слишком часто — подождите пару минут", 429);
  }

  const ticket = readTicket(String(body.ticket ?? ""));
  if (!ticket) return bad("Сессия подтверждения не найдена — начните заново");

  const code = generateCode();
  const name = String(body.name ?? "").trim().slice(0, 100);
  const sent = await sendCodeEmail(ticket.email, name, code);
  if (!sent) return bad("Не удалось отправить письмо, попробуйте позже", 503);

  // Прежний билет передаём дальше: его ещё живые коды остаются рабочими —
  // задержавшееся первое письмо покупатель откроет позже, и код подойдёт.
  return NextResponse.json({
    ticket: issueTicket(ticket.email, code, ticket),
    expiresIn: Math.round(ttlMs() / 1000),
  });
}
