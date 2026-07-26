// Слияние корзин — общая логика клиента (store-provider) и сервера
// (восстановление корзины после неуспешной оплаты). Без зависимостей от
// серверных модулей: импортируется и в браузерный бандл.
import type { CartItem } from "@/lib/types";

// Отфильтровать корзину из непроверенного источника (localStorage,
// user_store): остаются только записи со строковым id (числовые id —
// остатки после переезда с Supabase, такие товары больше не находятся).
export function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CartItem[]).filter((i) => typeof i?.id === "string");
}

// Слить две корзины: объединяем по id товара, количество — большее из двух
// (а не сумма — иначе слияние локальной и серверной копий одной корзины
// удваивало бы количество).
export function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of a) map.set(it.id, { ...it });
  for (const it of b) {
    const ex = map.get(it.id);
    if (ex) ex.qty = Math.max(ex.qty, it.qty);
    else map.set(it.id, { ...it });
  }
  return Array.from(map.values());
}
