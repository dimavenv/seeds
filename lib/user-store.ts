// Нормализация серверной корзины/избранного (коллекция user_store).
//
// Данные приходят из НЕдоверенного источника — браузера (в том числе из
// localStorage, который пользователь может править руками), поэтому поля берём
// по белому списку, числа приводим и ограничиваем, а длину массивов урезаем,
// чтобы JSON-поля user_store не раздували (у них есть maxSize в схеме).
//
// Живёт отдельным модулем (а не внутри app/store-actions.ts), потому что из
// файла с "use server" разрешено экспортировать только async-функции — а эти
// чистые помощники нужны ещё и тестам.
import { isValidRecordId } from "@/lib/pb/shared";
import { MAX_ITEMS_PER_ORDER, MAX_QTY_PER_ITEM } from "@/lib/checkout";
import type { CartItem } from "@/lib/types";

export const MAX_WISHLIST = 200;
const MAX_STR = 300;
const MAX_URL = 1000;

const str = (v: unknown, max = MAX_STR): string =>
  typeof v === "string" ? v.slice(0, max) : "";

export function normalizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= MAX_ITEMS_PER_ORDER) break;
    const e = entry as Record<string, unknown> | null;
    const id = e?.id;
    // Дубли одного товара отбрасываем (первый выигрывает), мусорные id — тоже.
    if (!isValidRecordId(id) || seen.has(id)) continue;
    const price = Number(e?.price);
    const qty = Math.floor(Number(e?.qty));
    const stockRaw = e?.stock;
    seen.add(id);
    out.push({
      id,
      slug: str(e?.slug),
      name: str(e?.name),
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      image_url: typeof e?.image_url === "string" ? str(e.image_url, MAX_URL) : null,
      qty: Math.min(MAX_QTY_PER_ITEM, Math.max(1, Number.isFinite(qty) ? qty : 1)),
      stock:
        typeof stockRaw === "number" && Number.isFinite(stockRaw)
          ? Math.max(0, Math.floor(stockRaw))
          : null,
    });
  }
  return out;
}

export function normalizeWishlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((x): x is string => isValidRecordId(x)))
  ).slice(0, MAX_WISHLIST);
}
