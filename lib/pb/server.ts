import "server-only";
import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import { PB_COOKIE } from "@/lib/pb/shared";

// Адрес PocketBase для серверных запросов. На VPS это 127.0.0.1:8090
// (PB_INTERNAL_URL) — быстрее и не зависит от nginx/TLS; в остальных случаях
// используется публичный адрес.
function internalUrl(): string {
  return (
    process.env.PB_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_PB_URL ||
    ""
  ).replace(/\/+$/, "");
}

function baseClient(cache: RequestCache = "no-store"): PocketBase {
  const pb = new PocketBase(internalUrl());
  pb.autoCancellation(false);
  // Таймаут на каждый запрос — чтобы недоступная база не подвешивала страницы.
  // cache по умолчанию no-store — Next иначе кэширует GET через свой fetch, и БД
  // начинает отдавать устаревшие записи (статусы оплаты, остатки, цены).
  pb.beforeSend = (url, options) => {
    options.signal ??= AbortSignal.timeout(10000);
    (options as { cache?: RequestCache }).cache ??= cache;
    return { url, options };
  };
  return pb;
}

// Публичный клиент без авторизации — для чтения каталога
// (внутри unstable_cache недоступны cookies()).
//
// ВАЖНО про cache (см. аудит: разбор DYNAMIC_SERVER_USAGE):
// при `next build` Next БРОСАЕТ DynamicServerError на любой no-store fetch,
// чтобы вывести страницу из статической генерации. SDK PocketBase эту ошибку
// перехватывает и оборачивает в ClientResponseError 0, поэтому сигнал до Next
// не доходит — и в статический HTML запекается результат фолбэка (пустой или
// демо-каталог). Чтобы страница могла остаться статической, читатели ВНУТРИ
// unstable_cache должны запрашивать кэшируемо: createPublicPb("force-cache").
// Свежесть там обеспечивает сам unstable_cache (revalidate + tags).
// Для цен, остатков и статусов оплаты оставляйте no-store (по умолчанию).
export function createPublicPb(cache: RequestCache = "no-store"): PocketBase {
  return baseClient(cache);
}

// Клиент с токеном пользователя из cookie — для SSR-страниц и server actions.
// Роль/валидность токена НЕ проверены: для этого есть getSession()/getSessionPb().
export function createServerPb(): PocketBase {
  const pb = baseClient();
  try {
    const raw = cookies().get(PB_COOKIE)?.value;
    if (raw) pb.authStore.loadFromCookie(`${PB_COOKIE}=${raw}`, PB_COOKIE);
  } catch {
    // вне request-контекста (например, при сборке) — остаёмся без auth
  }
  return pb;
}

export function hasAdminCredentials(): boolean {
  return Boolean(process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD);
}

// Суперпользователь PocketBase — аналог прежнего service role: серверные
// операции в обход правил (оформление заказа, заявки, импорт отзывов).
// Токен кэшируем, чтобы не логиниться на каждый запрос.
let adminCache: { token: string; record: unknown; at: number } | null = null;
const ADMIN_TOKEN_TTL_MS = 10 * 60 * 1000;

export async function pbAdmin(): Promise<PocketBase> {
  const pb = baseClient();
  if (adminCache && Date.now() - adminCache.at < ADMIN_TOKEN_TTL_MS) {
    pb.authStore.save(adminCache.token, adminCache.record as never);
    return pb;
  }
  try {
    await pb
      .collection("_superusers")
      .authWithPassword(
        process.env.PB_ADMIN_EMAIL!,
        process.env.PB_ADMIN_PASSWORD!
      );
  } catch (e) {
    adminCache = null;
    throw e;
  }
  adminCache = { token: pb.authStore.token, record: pb.authStore.record, at: Date.now() };
  return pb;
}
