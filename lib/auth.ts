import type PocketBase from "pocketbase";
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
// Роль берём ТОЛЬКО из ответа authRefresh (свежая запись из БД): содержимому
// cookie доверять нельзя — его контролирует клиент.
export async function getSessionPb(): Promise<{
  session: SessionInfo;
  pb: PocketBase;
}> {
  const pb = createServerPb();
  if (!isDbConfigured()) {
    return { session: { configured: false, ...GUEST }, pb };
  }
  if (!pb.authStore.token) {
    return { session: { configured: true, ...GUEST }, pb };
  }
  try {
    const { record } = await pb.collection("users").authRefresh();
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
