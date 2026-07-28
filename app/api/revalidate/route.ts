import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

// Сброс кэша каталога и карты сайта.
//
// Зачем нужен: sitemap.xml и списки товаров живут на ISR (кэш до часа). Когда
// каталог меняют ЧЕРЕЗ АДМИНКУ, кэш сбрасывают серверные действия сами. Но
// скрипты из scripts/ пишут напрямую в PocketBase, минуя Next, — и сайт ещё
// до часа отдавал бы старую карту сайта со старыми адресами. Скрипты дёргают
// этот роут в конце работы, и карта пересобирается сразу.
//
// Защищён тем же секретом, что и плановая уборка заказов (CRON_SECRET): пока
// он не задан, роут выключен (404), чтобы кэш нельзя было сбрасывать снаружи.
// Секрет передавайте заголовком:
//   Authorization: Bearer <CRON_SECRET>
function tokenOk(provided: string, secret: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // Сравнение постоянного времени: обычное === подсказывало бы секрет по
  // времени ответа.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && tokenOk(bearer, secret)) return true;
  const q = new URL(req.url).searchParams.get("token") || "";
  return Boolean(q) && tokenOk(q, secret);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    // Секрет не задан — ведём себя так, будто роута нет.
    return new NextResponse("Not found", { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  // Теги — те же, что ставят серверные действия админки.
  revalidateTag("products");
  revalidateTag("categories");
  // Карта сайта и витрина: их страницы кэшируются отдельно от тегов.
  revalidatePath("/sitemap.xml");
  revalidatePath("/catalog");
  revalidatePath("/");

  return NextResponse.json({ ok: true, revalidated: ["products", "categories", "/sitemap.xml"] });
}
