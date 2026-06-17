import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";

// Диагностика прав: открой /api/whoami залогиненным — видно, почему isAdmin
// ложный (нет user / роль не та / ошибка чтения / нет сервисного ключа).
export async function GET() {
  const configured = isSupabaseConfigured();
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const out: Record<string, unknown> = { configured, hasServiceKey };

  if (!configured) {
    out.error = "Supabase не настроен (.env.local)";
    return NextResponse.json(out);
  }

  // 1) Кто залогинен (по cookie).
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
    out.userId = userId;
    out.email = data?.user?.email ?? null;
    out.claimRole =
      data?.user?.app_metadata?.role ?? data?.user?.user_metadata?.role ?? null;
    if (error) out.getUserError = error.message;
  } catch (e) {
    out.getUserError = e instanceof Error ? e.message : String(e);
  }

  if (!userId) {
    out.note = "Не залогинен (нет user). Сначала войдите на /login.";
    return NextResponse.json(out);
  }

  // 2) Роль через cookie-клиент (как раньше, под RLS).
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    out.roleViaUserClient = data?.role ?? null;
    if (error) out.roleViaUserClientError = error.message;
  } catch (e) {
    out.roleViaUserClientError = e instanceof Error ? e.message : String(e);
  }

  // 3) Роль через сервисный клиент (в обход RLS) — то, что теперь использует гейт.
  if (hasServiceKey) {
    try {
      const svc = createServiceClient();
      const { data, error } = await svc
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      out.roleViaService = data?.role ?? null;
      if (error) out.roleViaServiceError = error.message;
    } catch (e) {
      out.roleViaServiceError = e instanceof Error ? e.message : String(e);
    }
  } else {
    out.roleViaService = null;
    out.note =
      "SUPABASE_SERVICE_ROLE_KEY не задан в .env.local — добавьте его (Project Settings → API → service_role).";
  }

  return NextResponse.json(out);
}
