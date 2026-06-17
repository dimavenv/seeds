import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";

// Диагностика доступности Supabase. Откройте /api/health в браузере.
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error:
        "Supabase не настроен: нет NEXT_PUBLIC_SUPABASE_URL / ANON_KEY в .env.local",
    });
  }

  const started = Date.now();
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true });
    const ms = Date.now() - started;

    if (error) {
      return NextResponse.json({
        ok: false,
        configured: true,
        ms,
        error:
          error.message ||
          "Запрос к Supabase не выполнен — проект недоступен (возможно, на паузе) или неверный URL/ключ.",
      });
    }
    return NextResponse.json({ ok: true, configured: true, ms });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      configured: true,
      ms: Date.now() - started,
      error:
        e instanceof Error
          ? e.message
          : "Не удалось подключиться к Supabase (таймаут или неверный адрес)",
    });
  }
}
