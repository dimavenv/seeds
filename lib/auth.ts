import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";

export type SessionInfo = {
  configured: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Похоже ли на временную сетевую ошибку/таймаут (а не штатный ответ).
// На только что проснувшемся (медленном) проекте Supabase отдельные запросы
// иногда срываются — такие ошибки имеет смысл повторить, а не считать «нет прав».
function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; status?: number };
  const text = `${e.name ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (
    text.includes("abort") ||
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("retryable") ||
    text.includes("econnreset") ||
    text.includes("und_err")
  ) {
    return true;
  }
  // Серверные ошибки (5xx) или ответ без статуса (упавший fetch) — тоже временные.
  if (typeof e.status === "number") return e.status >= 500;
  return false;
}

export async function getSession(): Promise<SessionInfo> {
  if (!isSupabaseConfigured()) {
    return { configured: false, userId: null, email: null, isAdmin: false };
  }
  const supabase = createClient();

  // 1) Текущий пользователь. Повторяем только при временной ошибке;
  //    «нет сессии» — штатный случай, ретраить не нужно.
  type AuthUser = {
    id: string;
    email?: string;
    app_metadata?: { role?: string };
    user_metadata?: { role?: string };
  };
  let user: AuthUser | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) {
      user = data.user as AuthUser;
      break;
    }
    if (!isTransient(error)) break;
    if (attempt < 1) await sleep(500);
  }

  if (!user) {
    return { configured: true, userId: null, email: null, isAdmin: false };
  }

  // 2) Роль из JWT (app_metadata) — приходит вместе с getUser(), без отдельного
  //    запроса к БД. Это убирает лишний параллельный запрос на /admin и делает
  //    проверку прав надёжной даже на медленном канале.
  const claimRole = user.app_metadata?.role ?? user.user_metadata?.role;
  if (claimRole === "admin") {
    return {
      configured: true,
      userId: user.id,
      email: user.email ?? null,
      isAdmin: true,
    };
  }

  // 3) Фолбэк: если claim ещё не проставлен (пользователь не перелогинился после
  //    make-admin.sql) — читаем роль из profiles. Повторяем при временной ошибке,
  //    чтобы один таймаут не понижал админа до покупателя.
  let role: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!error) {
      role = profile?.role ?? null;
      break;
    }
    if (!isTransient(error)) {
      console.error("getSession: ошибка чтения profiles", error);
      break;
    }
    if (attempt < 1) await sleep(500);
  }

  return {
    configured: true,
    userId: user.id,
    email: user.email ?? null,
    isAdmin: role === "admin",
  };
}
