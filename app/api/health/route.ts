import { NextResponse } from "next/server";
import { createPublicPb } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured } from "@/lib/pb/shared";

// Диагностика доступности PocketBase. Откройте /api/health в браузере.
// force-dynamic обязателен: иначе при `next build` ответ запекается статически
// и на проде роут всегда возвращал бы состояние на момент сборки.
//
// Наружу отдаём только «работает / не работает» и время ответа: этого хватает
// и человеку, и внешнему монитору. Текст ошибки виден администратору — в нём
// бывает внутренний адрес базы и подробности устройства сервера, и случайному
// посетителю их знать незачем.
export const dynamic = "force-dynamic";

async function detail(message: string): Promise<{ error?: string }> {
  try {
    const session = await getSession();
    return session.isAdmin ? { error: message } : {};
  } catch {
    return {};
  }
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      ...(await detail(
        "PocketBase не настроен: нет NEXT_PUBLIC_PB_URL в .env.production"
      )),
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
      ...(await detail(
        e instanceof Error
          ? e.message
          : "Не удалось подключиться к PocketBase (сервис остановлен или неверный адрес)"
      )),
    });
  }
}
