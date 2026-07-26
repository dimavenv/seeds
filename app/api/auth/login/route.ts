import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";
import { allowAttempt } from "@/lib/email-code";
import { createPublicPb } from "@/lib/pb/server";
import { PB_COOKIE, isDbConfigured } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Серверный вход. Пароль проверяется на сервере (PocketBase authWithPassword),
// а сессия кладётся в httpOnly-cookie pb_auth — из JS её прочитать нельзя, так
// что XSS больше не крадёт токен из cookie (аудит 4.2). Токен также возвращается
// в теле ответа: на этом этапе (фаза 1) клиентский SDK ещё держит его в памяти
// для собственных запросов (корзина, загрузка фото) — они уходят с заголовком
// Authorization. В фазе 2 эти запросы переедут на сервер, в фазе 3 токен
// перестанем отдавать в браузер вовсе.
export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "База недоступна" }, { status: 503 });
  }

  let body: { email?: unknown; password?: unknown; captchaToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
  }

  const ip = clientIp(req);
  // Троттлинг перебора паролей per-IP (аудит 4.6).
  if (!allowAttempt(`login:${ip ?? "?"}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Слишком много попыток входа — подождите пару минут" },
      { status: 429 }
    );
  }
  if (
    !(await verifyCaptcha(
      typeof body.captchaToken === "string" ? body.captchaToken : "",
      ip,
      { failClosed: true }
    ))
  ) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }

  const pb = createPublicPb();
  try {
    await pb.collection("users").authWithPassword(email, password);
  } catch {
    // Единое сообщение для неверной почты и пароля — без перечисления аккаунтов.
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const secure = (req.headers.get("x-forwarded-proto") || "https") === "https";
  // exportToCookie даёт готовую строку Set-Cookie в формате, который читает
  // createServerPb (loadFromCookie). httpOnly — сессия недоступна из JS.
  const cookie = pb.authStore.exportToCookie(
    { httpOnly: true, secure, sameSite: "Lax", path: "/" },
    PB_COOKIE
  );

  const record = pb.authStore.record as { role?: string } | null;
  const res = NextResponse.json({
    ok: true,
    token: pb.authStore.token,
    record: pb.authStore.record,
    isAdmin: record?.role === "admin",
  });
  res.headers.append("Set-Cookie", cookie);
  return res;
}
