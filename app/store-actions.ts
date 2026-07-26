"use server";

import { getSessionPb } from "@/lib/auth";
import { normalizeCart, normalizeWishlist } from "@/lib/user-store";
import type { CartItem } from "@/lib/types";

// Серверная корзина/избранное (коллекция user_store).
//
// Раньше браузер обращался к user_store напрямую клиентским SDK PocketBase, из-за
// чего в браузере обязан был лежать токен сессии (аудит 4.2). Теперь чтение и
// запись идут через эти server actions по httpOnly-cookie: токен в JS не нужен.
//
// Пользователь берётся ТОЛЬКО из серверной сессии (getSessionPb) — клиент больше
// не присылает user id, так что подставить чужой нельзя. Server actions в App
// Router дополнительно защищены встроенной проверкой Origin (CSRF).

export type UserStoreSnapshot = {
  // Есть ли серверная сессия (по httpOnly-cookie).
  signedIn: boolean;
  userId: string | null;
  cart: CartItem[];
  wishlist: string[];
  // Существует ли запись user_store. Важно отличать «запись есть и корзина
  // пуста» (сервер — источник истины, локальную корзину подменяем) от «записи
  // нет / не прочиталась» (тогда локальную корзину НЕ теряем, а сливаем и
  // записываем заново).
  exists: boolean;
};

const GUEST: UserStoreSnapshot = {
  signedIn: false,
  userId: null,
  cart: [],
  wishlist: [],
  exists: false,
};

// Кто вошёл + его серверная корзина/избранное. Один запрос вместо прежней пары
// «спросить authStore в браузере» + «прочитать user_store из браузера».
export async function loadUserStore(): Promise<UserStoreSnapshot> {
  const { session, pb } = await getSessionPb();
  if (!session.userId) return GUEST;
  try {
    const rec = await pb
      .collection("user_store")
      .getFirstListItem(pb.filter("user = {:u}", { u: session.userId }));
    return {
      signedIn: true,
      userId: session.userId,
      cart: normalizeCart(rec.cart),
      wishlist: normalizeWishlist(rec.wishlist),
      exists: true,
    };
  } catch {
    // Записи ещё нет (или база недоступна) — серверной корзины нет, но локальную
    // терять нельзя: exists:false отправит клиента в ветку слияния.
    return {
      signedIn: true,
      userId: session.userId,
      cart: [],
      wishlist: [],
      exists: false,
    };
  }
}

// Записать корзину/избранное текущего пользователя (upsert по сессии).
// Возвращает ok:false, если пользователь не вошёл или база недоступна —
// клиент в этом случае просто оставляет данные в localStorage.
export async function saveUserStore(input: {
  cart: unknown;
  wishlist: unknown;
}): Promise<{ ok: boolean }> {
  const { session, pb } = await getSessionPb();
  if (!session.userId) return { ok: false };

  const payload = {
    user: session.userId, // из сессии, не из запроса
    cart: normalizeCart(input.cart),
    wishlist: normalizeWishlist(input.wishlist),
  };

  try {
    // Уникальный индекс на user: сначала пробуем найти существующую запись.
    const rec = await pb
      .collection("user_store")
      .getFirstListItem(pb.filter("user = {:u}", { u: session.userId }))
      .catch(() => null);
    if (rec) {
      await pb.collection("user_store").update(rec.id, payload);
      return { ok: true };
    }
    await pb.collection("user_store").create(payload);
    return { ok: true };
  } catch {
    // Гонка create (двойной запрос на новую запись) — перечитываем и обновляем.
    try {
      const rec = await pb
        .collection("user_store")
        .getFirstListItem(pb.filter("user = {:u}", { u: session.userId }));
      await pb.collection("user_store").update(rec.id, payload);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}
