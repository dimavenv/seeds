// Решение «слить или довериться серверу» при загрузке страницы + само слияние.
//
// Вынесено из components/store-provider.tsx чистыми функциями, чтобы правило
// покрывалось тестами: терять товары из корзины нельзя, и это ровно тот случай,
// где раньше был баг (гостевые товары пропадали при входе в аккаунт со своей
// непустой корзиной).
import { MAX_QTY_PER_ITEM } from "@/lib/checkout";
import type { CartItem } from "@/lib/types";

// Ключ localStorage: для какого пользователя локальная корзина уже слита с
// серверной. Пока метка совпадает с текущим userId, сервер — источник истины
// при обычной загрузке страницы (иначе удалённое на другом устройстве
// «воскресало» бы из localStorage).
export const SYNC_KEY = "sc_synced_user";

// Ключ localStorage: «на этом устройстве только что выполнен вход».
// Ставит serverLogin() (единственная точка входа), снимает провайдер после
// слияния. Нужен потому, что SYNC_KEY — НЕнадёжный признак «уже слито»: он
// снимается только когда загрузка страницы застала гостя. Если сессия
// закончилась без такой загрузки (истёк токен, стёрли cookie, повторный вход в
// тот же аккаунт в этом же браузере), метка оставалась от прошлой сессии и
// сервер побеждал — гостевые товары терялись.
export const PENDING_MERGE_KEY = "sc_merge_on_login";

// Ограничение количества: целое, не больше известного остатка (если остаток
// неизвестен — не ограничиваем им) и не больше абсолютного потолка сервера
// (MAX_QTY_PER_ITEM — тот же лимит проверяет /api/checkout, чтобы корзина не
// разрослась до абсурда правкой localStorage).
export function capQty(qty: number, stock: number | null | undefined): number {
  const byMax = Math.min(MAX_QTY_PER_ITEM, Math.floor(qty));
  return typeof stock === "number" && stock >= 0 ? Math.min(byMax, stock) : byMax;
}

// Слить две корзины: объединяем по id, количество — БОЛЬШЕЕ из двух (не сумма,
// иначе слияние локальной и серверной копий одной корзины удваивало бы
// количество), в пределах известного остатка.
export function mergeCartsWithStock(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of a) map.set(it.id, { ...it });
  for (const it of b) {
    const ex = map.get(it.id);
    if (ex) {
      ex.qty = Math.max(ex.qty, it.qty);
      ex.stock = it.stock ?? ex.stock;
    } else map.set(it.id, { ...it });
  }
  return Array.from(map.values()).map((i) => ({
    ...i,
    qty: Math.max(1, capQty(i.qty, i.stock)),
  }));
}

export type CartResolution = {
  // "merge" — результат надо записать на сервер и поставить метку SYNC_KEY.
  // "trust-server" — просто показать серверные данные.
  // "keep-local" — локальное состояние НОВЕЕ серверного снимка (пользователь
  //   успел изменить корзину, пока тот грузился): показать локальное и
  //   дописать его на сервер.
  action: "merge" | "trust-server" | "keep-local";
  cart: CartItem[];
  wishlist: string[];
};

export function resolveCartOnLoad(input: {
  localCart: CartItem[];
  localWishlist: string[];
  serverCart: CartItem[];
  serverWishlist: string[];
  // Существует ли запись user_store. Если нет (удалена/не прочиталась), пустой
  // серверной корзиной нельзя затирать локальную.
  serverExists: boolean;
  // Значение метки SYNC_KEY из localStorage.
  syncedUser: string | null;
  userId: string;
  // На этом устройстве только что выполнен вход (флаг PENDING_MERGE_KEY).
  justLoggedIn: boolean;
  // Пользователь изменил корзину, ПОКА грузился серверный снимок (у провайдера
  // лежит неподтверждённая запись) — локальное состояние заведомо новее.
  localIsNewer?: boolean;
  // Клиентские «надгробия»: id товаров, удалённых локально, но ещё не
  // подтверждённых сервером (см. readRemovedPending). Вычитаются из серверной
  // копии, чтобы удалённое не воскресало из устаревшего серверного снимка.
  removedPending?: string[];
}): CartResolution {
  const {
    localCart,
    localWishlist,
    serverCart,
    serverWishlist,
    serverExists,
    syncedUser,
    userId,
    justLoggedIn,
    localIsNewer,
    removedPending,
  } = input;

  // Свежие локальные действия побеждают всё: серверный снимок сделан ДО них.
  if (localIsNewer) {
    return { action: "keep-local", cart: localCart, wishlist: localWishlist };
  }

  // Надгробия применяются только в рамках той же залогиненной сессии. При
  // входе в аккаунт (justLoggedIn) их игнорируем: гостевые удаления не должны
  // стирать товары, которые лежали в корзине аккаунта независимо от гостя.
  const server = justLoggedIn
    ? serverCart
    : subtractRemoved(serverCart, removedPending ?? []);

  // Вход только что выполнен — сливаем ВСЕГДА. Гостевые товары не должны
  // потеряться, даже если у аккаунта уже есть непустая корзина и метка
  // синхронизации осталась от прошлой сессии в этом браузере.
  const trustServer = !justLoggedIn && serverExists && syncedUser === userId;

  if (trustServer) {
    return { action: "trust-server", cart: server, wishlist: serverWishlist };
  }
  return {
    action: "merge",
    cart: mergeCartsWithStock(localCart, server),
    wishlist: Array.from(new Set([...localWishlist, ...serverWishlist])),
  };
}

// ===== Клиентские «надгробия» удалённых товаров ==============================
// Проблема: удаление уходит на сервер write-through, но если запись НЕ дошла
// (сеть упала, вкладку закрыли), при следующей загрузке устаревшая серверная
// копия воскрешала удалённый товар — и trust-server, и merge не отличают
// «удалено» от «не было». Решение: список удалённых-но-неподтверждённых id в
// localStorage (переживает перезагрузку). При загрузке он вычитается из
// серверной копии, а очищается только когда сервер подтвердил актуальный
// снимок. Работает на этом устройстве; для распространения удалений между
// устройствами нужны серверные надгробия (сознательно вне рамок: серверная
// логика не трогается).

export const REMOVED_PENDING_KEY = "sc_removed_pending";

// Обновить список надгробий после действия с корзиной: id, пропавшие из
// корзины, добавляются; id, снова оказавшиеся в корзине, — убираются
// (товар вернули — вычитать его из серверной копии больше нельзя).
export function nextRemovedPending(
  current: string[],
  prevCart: CartItem[],
  nextCart: CartItem[]
): string[] {
  const nextIds = new Set(nextCart.map((i) => i.id));
  const gone = prevCart.filter((i) => !nextIds.has(i.id)).map((i) => i.id);
  return Array.from(new Set([...current, ...gone])).filter(
    (id) => !nextIds.has(id)
  );
}

// Убрать из корзины позиции с надгробиями.
export function subtractRemoved(
  cart: CartItem[],
  removedIds: string[]
): CartItem[] {
  if (removedIds.length === 0) return cart;
  const removed = new Set(removedIds);
  return cart.filter((i) => !removed.has(i.id));
}

export function readRemovedPending(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(REMOVED_PENDING_KEY) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeRemovedPending(ids: string[]): void {
  try {
    if (ids.length === 0) localStorage.removeItem(REMOVED_PENDING_KEY);
    else localStorage.setItem(REMOVED_PENDING_KEY, JSON.stringify(ids));
  } catch {
    // приватный режим/квота — без надгробий, поведение как раньше
  }
}

export function clearRemovedPending(): void {
  try {
    localStorage.removeItem(REMOVED_PENDING_KEY);
  } catch {}
}

// ===== Флаг «только что вошли» (localStorage, поэтому с защитой от отказа) ====

export function markPendingMerge(): void {
  try {
    localStorage.setItem(PENDING_MERGE_KEY, "1");
  } catch {
    // приватный режим/квота — просто обойдёмся меткой SYNC_KEY
  }
}

// Прочитать и сразу снять флаг (одноразовый).
export function consumePendingMerge(): boolean {
  try {
    const v = localStorage.getItem(PENDING_MERGE_KEY);
    if (v) localStorage.removeItem(PENDING_MERGE_KEY);
    return Boolean(v);
  } catch {
    return false;
  }
}
