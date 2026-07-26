// Чистая логика корзины/избранного: (состояние, действие) → новое состояние.
//
// Вынесена из components/store-provider.tsx, чтобы самое рискованное правило —
// «несколько действий подряд в одном тике не теряют друг друга» (кнопка
// «Заказать ещё раз» добавляет весь состав заказа циклом) — покрывалось
// обычными юнит-тестами без React-окружения. Провайдер лишь вызывает редьюсер
// от синхронного рефа и синхронизирует реф с состоянием.
import { capQty } from "@/lib/cart-sync";
import type { CartItem, Product } from "@/lib/types";

export type CartAction =
  | { type: "add"; product: Product; qty?: number }
  | { type: "set-qty"; id: string; qty: number }
  | { type: "remove"; id: string }
  | { type: "clear" };

export function cartReducer(cart: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case "add": {
      const { product } = action;
      const qty = action.qty ?? 1;
      const found = cart.find((i) => i.id === product.id);
      if (found) {
        return cart.map((i) =>
          i.id === product.id
            ? {
                ...i,
                // Остаток обновляем из свежих данных товара.
                stock: product.stock,
                qty: Math.max(1, capQty(i.qty + qty, product.stock)),
              }
            : i
        );
      }
      return [
        ...cart,
        {
          id: product.id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          stock: product.stock,
          qty: Math.max(1, capQty(qty, product.stock)),
        },
      ];
    }
    // Количество зажато снизу единицей — до нуля позиция не опускается,
    // для удаления есть действие remove.
    case "set-qty":
      return cart.map((i) =>
        i.id === action.id
          ? { ...i, qty: Math.max(1, capQty(action.qty, i.stock)) }
          : i
      );
    case "remove":
      return cart.filter((i) => i.id !== action.id);
    case "clear":
      return [];
  }
}

// Избранное: добавить id, если его нет, иначе убрать.
export function toggleWishlist(wishlist: string[], id: string): string[] {
  return wishlist.includes(id)
    ? wishlist.filter((x) => x !== id)
    : [...wishlist, id];
}
