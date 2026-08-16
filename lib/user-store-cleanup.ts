// Вычистить удалённый товар из корзин и избранного покупателей.
//
// Корзина и избранное живут в user_store СНИМКОМ: id товара, название, цена,
// картинка. Снимок нужен, чтобы корзина открывалась без похода в каталог за
// каждым товаром, но у него есть обратная сторона — удалённый из каталога товар
// продолжал лежать в корзине и в избранном, пока покупатель не уберёт его сам.
// Оформить заказ с ним всё равно не вышло бы (сервер проверяет товары), так что
// это была не дыра, а мусор — но мусор, который выглядит как рабочий товар.
//
// Правит записи ЧУЖИХ пользователей, поэтому идёт через суперпользователя:
// правила user_store пускают только к своей записи (и админ сайта — обычный
// пользователь с точки зрения этих правил).
//
// Клиент подстраховывает эту зачистку со своей стороны (см. эффект «товары
// пропали из каталога» в components/store-provider.tsx): у покупателя копия
// корзины лежит ещё и в localStorage, до которого сервер не дотянется.
import { pbAdmin } from "@/lib/pb/server";
import { normalizeCart, normalizeWishlist } from "@/lib/user-store";
import type { CartItem } from "@/lib/types";

// Сколько записей user_store перебираем за раз. Обычная лавка — сотни записей,
// но упереться в память на ровном месте не хочется.
const PAGE = 200;
const MAX_PAGES = 50;

export type StorePurge = { cart: CartItem[]; wishlist: string[]; changed: boolean };

// Чистая часть: убрать товары из одного снимка. Отдельно от похода в базу,
// чтобы правило проверялось тестом.
export function purgeFromSnapshot(
  cart: unknown,
  wishlist: unknown,
  removedIds: string[]
): StorePurge {
  const gone = new Set(removedIds);
  const prevCart = normalizeCart(cart);
  const prevWish = normalizeWishlist(wishlist);
  const nextCart = prevCart.filter((i) => !gone.has(i.id));
  const nextWish = prevWish.filter((id) => !gone.has(id));
  return {
    cart: nextCart,
    wishlist: nextWish,
    changed: nextCart.length !== prevCart.length || nextWish.length !== prevWish.length,
  };
}

// Убрать товары из корзин и избранного ВСЕХ покупателей.
// Ошибки не бросает: удаление товара уже произошло, и падать из-за уборки
// незачем — клиент всё равно отфильтрует пропавшие товары у себя.
export async function purgeProductsFromStores(
  productIds: string[]
): Promise<{ updated: number }> {
  const ids = productIds.filter(Boolean);
  if (ids.length === 0) return { updated: 0 };

  let updated = 0;
  try {
    const pb = await pbAdmin();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const list = await pb
        .collection("user_store")
        .getList(page, PAGE, { sort: "created", fields: "id,cart,wishlist" });
      for (const rec of list.items) {
        const next = purgeFromSnapshot(rec.cart, rec.wishlist, ids);
        if (!next.changed) continue;
        await pb
          .collection("user_store")
          .update(rec.id, { cart: next.cart, wishlist: next.wishlist })
          .then(() => {
            updated++;
          })
          .catch(() => {});
      }
      if (page >= list.totalPages) break;
    }
  } catch (e) {
    console.error("[user-store] не удалось вычистить удалённый товар —", e);
  }
  return { updated };
}
