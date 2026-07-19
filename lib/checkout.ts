import { isValidRecordId } from "@/lib/pb/shared";

// Нормализация состава заказа из запроса оформления. Чистая функция — легко
// тестировать и переиспользовать. Правила:
//  - id должен быть валидным id записи PocketBase;
//  - qty приводится к целому (дробное — вниз), qty < 1 отбрасывается;
//  - дубли одного товара складываются;
//  - количество на позицию и число позиций ограничены разумным потолком,
//    чтобы нельзя было прислать заказ на миллиард пакетиков или фильтр
//    на тысячи id.
export const MAX_ITEMS_PER_ORDER = 100;
export const MAX_QTY_PER_ITEM = 999;

export type CheckoutItem = { id: string; qty: number };

export function normalizeCheckoutItems(raw: unknown): CheckoutItem[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, number>();
  for (const entry of raw) {
    const id = (entry as { id?: unknown })?.id;
    const rawQty = (entry as { qty?: unknown })?.qty;
    if (!isValidRecordId(id)) continue;
    if (typeof rawQty !== "number" || !Number.isFinite(rawQty)) continue;
    const qty = Math.floor(rawQty);
    if (qty < 1) continue;
    if (!byId.has(id) && byId.size >= MAX_ITEMS_PER_ORDER) continue;
    byId.set(id, Math.min((byId.get(id) ?? 0) + qty, MAX_QTY_PER_ITEM));
  }
  return Array.from(byId, ([id, qty]) => ({ id, qty }));
}

// Проверка наличия: хватает ли остатка на каждую позицию.
// Возвращает список проблемных позиций (пустой — всё в наличии).
export function findStockIssues(
  lines: { name: string; qty: number; stock: number }[]
): { name: string; qty: number; stock: number }[] {
  return lines.filter((l) => l.qty > Math.max(0, l.stock));
}
