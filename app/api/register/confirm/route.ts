import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import {
  readTicket,
  codeMatches,
  allowAttempt,
  allowForEmail,
  CODE_ATTEMPTS_PER_EMAIL,
  CODE_ATTEMPT_WINDOW_MS,
} from "@/lib/email-code";
import { parseRegInput, dbReady, createUser } from "@/lib/registration";
import { recordConsent } from "@/lib/consent";
import { pbAdmin } from "@/lib/pb/server";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Шаг 2 регистрации: проверка кода из письма и создание аккаунта.
// Билет выдан только после капчи и проверки почты на шаге 1, поэтому здесь
// капча не нужна. Почта берётся ИЗ БИЛЕТА (подделать его нельзя) — подсунуть
// другой адрес после отправки кода не выйдет.
export async function POST(request: Request) {
  // Запрос обязан прийти с нашей же страницы (см. lib/csrf.ts).
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const ip = clientIp(request);
  // От перебора шестизначного кода: 10 попыток за 10 минут с IP.
  if (!allowAttempt(`confirm:${ip ?? "?"}`, 10, 10 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите несколько минут", 429);
  }

  const ticket = readTicket(String(body.ticket ?? ""));
  if (!ticket) return bad("Сессия подтверждения не найдена — начните заново");
  if (ticket.expired) {
    return bad("Код устарел — запросите новый");
  }
  // Счётчик попыток на сам ящик. Билет не хранится на сервере, поэтому «пять
  // попыток и код сгорел» напрямую не сделать — но цель перебора всегда
  // конкретный адрес, а он в билете подписан и подменить его нельзя. Смена IP
  // такой счётчик не обнуляет.
  if (
    !allowForEmail(
      "confirm",
      ticket.email,
      CODE_ATTEMPTS_PER_EMAIL,
      CODE_ATTEMPT_WINDOW_MS
    )
  ) {
    return bad(
      "Слишком много неверных кодов — запросите новый код через несколько минут",
      429
    );
  }
  if (!codeMatches(ticket, String(body.code ?? ""))) {
    return bad("Неверный код, проверьте письмо");
  }

  const { input, error } = parseRegInput({ ...body, email: ticket.email });
  if (error) return bad(error);
  if (!dbReady()) return bad("Регистрация временно недоступна", 503);

  const res = await createUser(input, true); // почта подтверждена кодом
  if (!res.ok) return bad(res.error, res.status);
  // Согласие зафиксировано на шаге 1 (там же его проверяли), но аккаунт
  // появляется только здесь — привязываем запись к подтверждённой почте.
  await recordConsent(await pbAdmin(), {
    email: ticket.email,
    purpose: "register",
  });
  return NextResponse.json({ ok: true });
}
