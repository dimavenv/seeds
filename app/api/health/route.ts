import { NextResponse } from "next/server";
import { createPublicPb } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";

// Диагностика доступности PocketBase. Откройте /api/health в браузере.
// force-dynamic обязателен: иначе при `next build` ответ запекается статически
// и на проде роут всегда возвращал бы состояние на момент сборки.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error:
        "PocketBase не настроен: нет NEXT_PUBLIC_PB_URL в .env.production",
    });
  }

  const started = Date.now();
  try {
    const pb = createPublicPb();
    await pb.health.check();
    // Дополнительно проверяем, что схема на месте (коллекция categories).
    await pb.collection("categories").getList(1, 1);
    return NextResponse.json({ ok: true, configured: true, ms: Date.now() - started });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      configured: true,
      ms: Date.now() - started,
      error:
        e instanceof Error
          ? e.message
          : "Не удалось подключиться к PocketBase (сервис остановлен или неверный адрес)",
    });
  }
}
