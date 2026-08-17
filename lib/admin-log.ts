import "server-only";
import { headers } from "next/headers";
import { pbAdmin } from "@/lib/pb/server";
import { clientIpFromHeaders } from "@/lib/client-ip";
import type { SessionInfo } from "@/lib/auth";

// Журнал действий администратора (аудит 6.4).
//
// Зачем он нужен: без записи «кто и когда» на вопросы «почему у этого товара
// другая цена», «кто удалил заказ №1042», «кто разблокировал этот аккаунт»
// ответить нечем — в базе видно только результат. Особенно это важно, если
// доступ в админку есть у нескольких человек или если сессию всё-таки угнали:
// журнал — единственное место, где видно чужие действия.
//
// Устройство: коллекция admin_log только на запись сервером (createRule = null,
// то есть писать может лишь суперпользователь) и только на чтение
// администратором. update/delete закрыты вообще — запись, попавшую в журнал,
// нельзя ни исправить, ни удалить через API, даже с правами администратора.
//
// Запись в журнал НИКОГДА не должна ломать само действие: всё внутри try, при
// ошибке — строка в лог процесса.

export type AdminLogEntry = {
  // Что сделали: короткий машинный код (product.update, order.delete, ...).
  action: string;
  // К чему это относится: номер заказа, название товара, почта покупателя.
  target?: string | null;
  // Человеческое пояснение: «цена 120 ₽ → 150 ₽», «статус: отправлен».
  summary?: string | null;
};

export async function logAdminAction(
  session: Pick<SessionInfo, "userId" | "email">,
  entry: AdminLogEntry
): Promise<void> {
  try {
    let ip: string | undefined;
    let userAgentless = true;
    try {
      const h = headers();
      ip = clientIpFromHeaders(h);
      userAgentless = false;
    } catch {
      // Вне контекста запроса (например, из скрипта) — журналируем без IP.
    }
    const pb = await pbAdmin();
    await pb.collection("admin_log").create({
      actor: session.userId ?? "",
      actor_email: session.email ?? "",
      action: entry.action.slice(0, 60),
      target: (entry.target ?? "").slice(0, 120),
      summary: (entry.summary ?? "").slice(0, 500),
      ip: userAgentless ? "" : (ip ?? "").slice(0, 60),
    });
  } catch (e) {
    console.error(`[admin-log] не удалось записать «${entry.action}»:`, e);
  }
}

// Компактное описание изменений «было → стало» для поля summary.
// Пишем только то, что реально изменилось: строка «цена 120 ₽ → 150 ₽»
// полезна, а перечисление всех полей формы — нет.
export function describeChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  labels: Record<string, string>
): string {
  const parts: string[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const was = before?.[field];
    const now = after[field];
    if (before && String(was ?? "") === String(now ?? "")) continue;
    parts.push(
      before ? `${label}: ${format(was)} → ${format(now)}` : `${label}: ${format(now)}`
    );
  }
  return parts.join("; ");
}

function format(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "да" : "нет";
  return String(v).slice(0, 80);
}
