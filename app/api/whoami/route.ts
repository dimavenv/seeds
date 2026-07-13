import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerPb, hasAdminCredentials, pbAdmin } from "@/lib/pb/server";
import { isDbConfigured, PB_COOKIE } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Диагностика прав: откройте /api/whoami залогиненным — видно, почему isAdmin
// ложный (нет cookie / токен истёк / роль не admin / нет суперпользователя).
export async function GET() {
  const configured = isDbConfigured();
  const out: Record<string, unknown> = {
    configured,
    hasAdminCredentials: hasAdminCredentials(),
  };

  if (!configured) {
    out.error = "PocketBase не настроен (NEXT_PUBLIC_PB_URL в .env.production)";
    return NextResponse.json(out);
  }

  out.hasCookie = Boolean(cookies().get(PB_COOKIE)?.value);

  // 1) Кто залогинен (по cookie) и его роль из свежей записи БД.
  try {
    const pb = createServerPb();
    if (!pb.authStore.token) {
      out.note = "Не залогинен (нет токена). Сначала войдите на /login.";
    } else {
      const { record } = await pb.collection("users").authRefresh();
      out.userId = record.id;
      out.email = record.email ?? null;
      out.role = record.role || "customer";
      out.isAdmin = record.role === "admin";
    }
  } catch (e) {
    out.authError = e instanceof Error ? e.message : String(e);
    out.note = "Токен не прошёл проверку — войдите заново на /login.";
  }

  // 2) Работает ли суперпользователь (нужен для оформления заказов).
  if (hasAdminCredentials()) {
    try {
      await pbAdmin();
      out.superuserOk = true;
    } catch (e) {
      out.superuserOk = false;
      out.superuserError = e instanceof Error ? e.message : String(e);
    }
  } else {
    out.note2 =
      "PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD не заданы в .env.production — оформление заказов работать не будет.";
  }

  return NextResponse.json(out);
}
