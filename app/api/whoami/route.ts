import { NextResponse } from "next/server";
import { getSession, readRole } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/data";

// Диагностика прав ДЛЯ ВОШЕДШЕГО пользователя: показывает только его
// собственную роль. Не раскрывает серверную конфигурацию (наличие сервисного
// ключа) и внутренние тексты ошибок (аудит #4 — устранена утечка).
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const profileRole = await readRole(session.userId);
  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    isAdmin: session.isAdmin,
    profileRole,
  });
}
