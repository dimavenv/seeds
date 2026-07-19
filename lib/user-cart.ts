import type PocketBase from "pocketbase";
import { isValidRecordId, mapProduct } from "@/lib/pb/shared";
import { mergeCarts, sanitizeCartItems } from "@/lib/cart-merge";
import type { CartItem } from "@/lib/types";

// Восстановление корзины покупателя после неуспешной оплаты.
//
// Где корзина ВООБЩЕ чистится (проверено по коду):
//  - заказ без онлайн-оплаты: clearCart() на странице оформления — заказ уже
//    финален, оплате нечему падать;
//  - онлайн-оплата: ТОЛЬКО на возврате с банка ?paid=1 (ClearCartOnPaid);
//    при неуспехе банк возвращает на ?failed=1 — корзина не тронута.
// То есть терять корзину покупатель может лишь в узком случае: банк отправил
// его на ?paid=1 (корзина очищена и, у вошедшего, пустая корзина синхронизи-
// ровалась в user_store), а callback позже признал платёж неуспешным и заказ
// удалился.
//
// Этот помощник закрывает случай вошедшего покупателя: перед удалением
// неуспешного заказа его состав вливается обратно в серверную корзину
// (user_store) — при следующей синхронизации товары вернутся. Для гостя
// корзина живёт в localStorage браузера, и с сервера её не восстановить
// (но у гостя она и не чистится нигде, кроме ?paid=1).
//
// Функция «тихая»: любая ошибка попадает в лог и не прерывает callback.
export async function restoreUserCart(
  pb: PocketBase,
  userId: string,
  orderItems: { product?: unknown; qty?: unknown }[]
): Promise<void> {
  try {
    // Количество по товарам заказа (только реальные ссылки на товар).
    const qtyById = new Map<string, number>();
    for (const it of orderItems) {
      if (!isValidRecordId(it.product)) continue;
      const qty = Number(it.qty) || 0;
      if (qty < 1) continue;
      qtyById.set(it.product, (qtyById.get(it.product) ?? 0) + qty);
    }
    if (qtyById.size === 0) return;

    // Текущие данные товаров — для полей карточки корзины (name, slug, фото).
    // Товар мог быть удалён — такие позиции пропускаем: в корзине их всё
    // равно не отрисовать.
    const params: Record<string, string> = {};
    const or = Array.from(qtyById.keys()).map((id, i) => {
      params[`id${i}`] = id;
      return `id = {:id${i}}`;
    });
    const products = await pb
      .collection("products")
      .getFullList({ filter: pb.filter(or.join(" || "), params) });

    const restored: CartItem[] = products.map((r) => {
      const p = mapProduct(r);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
        qty: qtyById.get(p.id) ?? 1,
      };
    });
    if (restored.length === 0) return;

    // Влить в существующую серверную корзину (или создать запись).
    const record = await pb
      .collection("user_store")
      .getFirstListItem(pb.filter("user = {:u}", { u: userId }))
      .catch(() => null);

    const merged = mergeCarts(sanitizeCartItems(record?.cart), restored);
    if (record) {
      await pb.collection("user_store").update(record.id, { cart: merged });
    } else {
      await pb
        .collection("user_store")
        .create({ user: userId, cart: merged, wishlist: [] });
    }
  } catch (e) {
    console.error(`[cart] не удалось восстановить корзину пользователя ${userId}:`, e);
  }
}
