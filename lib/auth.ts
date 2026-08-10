import type PocketBase from "pocketbase";
import { getTokenPayload } from "pocketbase";
import { createServerPb } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";

export type SessionInfo = {
  configured: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

const GUEST: Omit<SessionInfo, "configured"> = {
  userId: null,
  email: null,
  isAdmin: false,
};

// Сессия + авторизованный клиент PocketBase для действий от имени пользователя.
//
// Роль и почту берём ТОЛЬКО из свежей записи в БД: содержимому cookie доверять
// нельзя — его контролирует клиент. Запись читаем запросом getOne, который
// PocketBase выполняет только с действительным токеном (проверяются подпись,
// срок и tokenKey записи), а правило доступа отдаёт её лишь владельцу. То есть
// это и проверка сессии, и получение актуальных данных — одним запросом.
//
// Раньше здесь был authRefresh. Он делал то же самое, но НЕ принимает
// статические токены, а именно такие выдаёт impersonate — им мы логиним
// покупателя после входа через VK ID (см. lib/external-login.ts), пароля
// которого у нас нет. Проверок это не ослабило: authRefresh валидирует токен
// ровно так же, а выдаваемый им новый токен мы всё равно не использовали.
export async function getSessionPb(): Promise<{
  session: SessionInfo;
  pb: PocketBase;
}> {
  const pb = createServerPb();
  if (!isDbConfigured()) {
    return { session: { configured: false, ...GUEST }, pb };
  }
  // isValid проверяет срок токена локально — истёкший не стоит и слать.
  // Чей это токен, берём из него самого: запись в cookie может оказаться
  // урезанной (exportToCookie обрезает её, когда cookie не влезает в 4 КБ).
  const userId =
    pb.authStore.record?.id ||
    (getTokenPayload(pb.authStore.token).id as string | undefined) ||
    "";
  if (!pb.authStore.token || !pb.authStore.isValid || !userId) {
    return { session: { configured: true, ...GUEST }, pb };
  }
  try {
    const record = await pb.collection("users").getOne(userId);
    return {
      session: {
        configured: true,
        userId: record.id,
        email: (record.email as string) || null,
        isAdmin: record.role === "admin",
      },
      pb,
    };
  } catch {
    // Токен истёк/недействителен или база недоступна — считаем гостем.
    pb.authStore.clear();
    return { session: { configured: true, ...GUEST }, pb };
  }
}

export async function getSession(): Promise<SessionInfo> {
  return (await getSessionPb()).session;
}
