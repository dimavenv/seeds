import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { allowAttempt } from "@/lib/email-code";
import { getSessionPb } from "@/lib/auth";
import { createPublicPb } from "@/lib/pb/server";
import { PB_COOKIE, isDbConfigured } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Смена пароля из личного кабинета.
//
// Текущий пароль обязателен: PocketBase проверяет его сам (oldPassword) — то
// есть даже с угнанной сессионной cookie сменить пароль без знания старого
// нельзя. После смены PocketBase гасит все выданные токены, поэтому сразу
// логинимся новым паролем и кладём свежую httpOnly-cookie: покупатель
// остаётся в кабинете, а другие устройства выходят.
function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return bad("База недоступна", 503);

  let body: { current?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (!current || !next) return bad("Заполните оба поля");
  // Минимум как в схеме PocketBase (поле password, min 8).
  if (next.length < 8) return bad("Новый пароль минимум 8 символов");
  if (next === current) return bad("Новый пароль совпадает с текущим");

  const ip = clientIp(request);
  // Тот же лимит, что и на входе: подбирать старый пароль здесь так же
  // бессмысленно, как на /login.
  if (!allowAttempt(`password:${ip ?? "?"}`, 10, 5 * 60 * 1000)) {
    return bad("Слишком много попыток — подождите пару минут", 429);
  }

  const { session, pb } = await getSessionPb();
  if (!session.userId || !session.email) {
    return bad("Войдите, чтобы сменить пароль", 401);
  }

  try {
    await pb.collection("users").update(session.userId, {
      oldPassword: current,
      password: next,
      passwordConfirm: next,
      // Пароль теперь свой, а не присланный сайтом после оплаты — подсказку
      // в кабинете больше не показываем.
      auto_password: false,
    });
  } catch (e) {
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (data && "oldPassword" in data) return bad("Текущий пароль неверный");
    if (data && "password" in data) return bad("Новый пароль слишком простой");
    return bad("Не удалось сменить пароль, попробуйте ещё раз", 503);
  }

  // Перевыпуск сессии: старый токен PocketBase уже недействителен.
  const fresh = createPublicPb();
  try {
    await fresh.collection("users").authWithPassword(session.email, next);
  } catch {
    // Пароль сменён, но переавторизоваться не вышло — просим войти заново.
    return NextResponse.json({ ok: true, reauth: true });
  }

  const secure = (request.headers.get("x-forwarded-proto") || "https") === "https";
  const res = NextResponse.json({
    ok: true,
    token: fresh.authStore.token,
    record: fresh.authStore.record,
  });
  res.headers.append(
    "Set-Cookie",
    fresh.authStore.exportToCookie(
      { httpOnly: true, secure, sameSite: "Lax", path: "/" },
      PB_COOKIE
    )
  );
  return res;
}
