import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasAdminCredentials, pbAdmin } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured, PB_COOKIE } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Диагностика прав: откройте /api/whoami залогиненным — видно, почему isAdmin
// ложный (нет cookie / токен истёк / роль не admin / нет суперпользователя).
//
// Ответ зависит от того, КТО спрашивает. Раньше роут отвечал одинаково всем, и
// случайный посетитель узнавал, заданы ли на сервере учётные данные
// суперпользователя, живы ли они и с какой именно ошибкой не проходит вход в
// базу; попутно каждый анонимный запрос заставлял сайт логиниться в PocketBase.
// Теперь:
//   • гость видит только «залогинены или нет»;
//   • покупатель — свою запись и роль (этого хватает на вопрос «почему я не
//     админ»);
//   • состояние суперпользователя и настроек — только администратору.
export async function GET() {
  const out: Record<string, unknown> = { configured: isDbConfigured() };

  if (!out.configured) {
    out.error = "PocketBase не настроен (NEXT_PUBLIC_PB_URL в .env.production)";
    return NextResponse.json(out);
  }

  out.hasCookie = Boolean(cookies().get(PB_COOKIE)?.value);

  const session = await getSession();
  out.authenticated = Boolean(session.userId);

  if (!session.userId) {
    out.note = session.blocked
      ? "Аккаунт заблокирован продавцом."
      : out.hasCookie
      ? "Сессия не прошла проверку — токен истёк или запись удалена. Войдите заново на /login."
      : "Не залогинен (нет cookie сессии). Сначала войдите на /login.";
    return NextResponse.json(out);
  }

  out.userId = session.userId;
  out.email = session.email;
  out.isAdmin = session.isAdmin;

  if (!session.isAdmin) {
    out.note =
      "Вход выполнен, но роль не admin. Роль ставится в базе: " +
      "node scripts/pb-make-admin.mjs you@example.com 'пароль' — " +
      "или вручную в админке PocketBase (коллекция users, поле role).";
    return NextResponse.json(out);
  }

  // Дальше — только для администратора: состояние суперпользователя, без
  // которого не работают оформление заказа, отзывы и заявки.
  out.hasAdminCredentials = hasAdminCredentials();
  if (!out.hasAdminCredentials) {
    out.note =
      "PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD не заданы в .env.production — оформление заказов работать не будет.";
    return NextResponse.json(out);
  }
  try {
    await pbAdmin();
    out.superuserOk = true;
  } catch (e) {
    out.superuserOk = false;
    out.superuserError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
