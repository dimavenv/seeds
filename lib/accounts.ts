import "server-only";
import type PocketBase from "pocketbase";
import { profileFromRecord, type Profile } from "@/lib/profile";
import { decryptProfile } from "@/lib/crypto";
import { normalizeSearch } from "@/lib/search";

// Чтение аккаунтов покупателей для админки.
//
// Список users закрыт правилами PocketBase (виден только владельцу и админу),
// поэтому читаем клиентом с токеном администратора — тем же, что и остальные
// разделы админки.

export type Account = {
  id: string;
  email: string;
  profile: Profile;
  isAdmin: boolean;
  verified: boolean;
  blocked: boolean;
  blockedReason: string | null;
  // Пароль придуман сайтом после оплаты и покупателем ещё не менялся.
  autoPassword: boolean;
  createdAt: string;
  // Сводка по заказам — считается по коллекции orders (см. attachOrderStats).
  ordersCount: number;
  ordersTotal: number;
  lastOrderAt: string | null;
};

function toAccount(rec: Record<string, unknown>): Account {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: String(rec.id),
    email: s(rec.email),
    // Телефон в аккаунте хранится зашифрованным (аудит 5.2) — админке
    // и поиску по списку он нужен в открытом виде.
    profile: decryptProfile(profileFromRecord(rec)),
    isAdmin: rec.role === "admin",
    verified: Boolean(rec.verified),
    blocked: Boolean(rec.blocked),
    blockedReason: s(rec.blocked_reason) || null,
    autoPassword: Boolean(rec.auto_password),
    createdAt: s(rec.created),
    ordersCount: 0,
    ordersTotal: 0,
    lastOrderAt: null,
  };
}

// Все аккаунты, новые сверху. Магазин небольшой — постранично не разбиваем,
// поиск по списку делает сама страница.
export async function fetchAccounts(pb: PocketBase): Promise<Account[]> {
  const records = await pb
    .collection("users")
    .getFullList({ sort: "-created" })
    .catch(() => []);
  const accounts = records.map((r) => toAccount(r as unknown as Record<string, unknown>));
  await attachOrderStats(pb, accounts);
  return accounts;
}

export async function fetchAccount(
  pb: PocketBase,
  id: string
): Promise<Account | null> {
  const rec = await pb.collection("users").getOne(id).catch(() => null);
  if (!rec) return null;
  const account = toAccount(rec as unknown as Record<string, unknown>);
  await attachOrderStats(pb, [account]);
  return account;
}

// Сколько заказов и на какую сумму. Одним запросом на всех: заказов у магазина
// на порядки меньше, чем строк в отчётах, а по одному запросу на аккаунт список
// бы заметно тормозил.
//
// Отменённые заказы в сумму не идут — иначе «потратил» показывал бы деньги,
// которых не было. В количестве они есть: продавцу полезно видеть и отказы.
async function attachOrderStats(
  pb: PocketBase,
  accounts: Account[]
): Promise<void> {
  if (accounts.length === 0) return;
  const records = await pb
    .collection("orders")
    .getFullList({ fields: "user,total,status,payment_status,placed_at" })
    .catch(() => []);

  const byUser = new Map<string, Account>(accounts.map((a) => [a.id, a]));
  for (const r of records) {
    const account = byUser.get(String(r.user ?? ""));
    if (!account) continue;
    account.ordersCount += 1;
    if (r.status !== "cancelled") account.ordersTotal += Number(r.total) || 0;
    const placed = String(r.placed_at ?? "");
    if (placed && (!account.lastOrderAt || placed > account.lastOrderAt)) {
      account.lastOrderAt = placed;
    }
  }
}

// Строка для поиска: почта, ФИО и телефон одним куском.
//
// Телефон кладём дважды — как хранится (+79991234567) и одними цифрами: искать
// продавец будет как придётся, «+7 999», «8 999» или просто «9991234».
// Нормализация та же, что в каталоге: регистр и ё/е значения не имеют.
export function accountHaystack(a: Account): string {
  const digits = a.profile.phone.replace(/\D/g, "");
  return normalizeSearch(
    [
      a.email,
      a.profile.last_name,
      a.profile.first_name,
      a.profile.middle_name,
      a.profile.phone,
      digits,
      // 8-9991234567 — привычная запись того же номера
      digits.startsWith("7") ? `8${digits.slice(1)}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}
