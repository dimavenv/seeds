import type PocketBase from "pocketbase";

// Списание/возврат остатков по составу заказа.
//   direction = -1 — списать (заказ оплачен),
//   direction = +1 — вернуть (оплата возвращена).
// Вызывается строго на ПЕРЕХОДЕ статуса оплаты (pending→paid, paid→refunded):
// повторные callback'и банка отфильтровываются до вызова, поэтому двойного
// списания не происходит. Остаток не опускаем ниже нуля.
export async function adjustStockForOrder(
  pb: PocketBase,
  orderId: string,
  direction: -1 | 1
): Promise<void> {
  const items = await pb.collection("order_items").getFullList({
    filter: pb.filter("order = {:id}", { id: orderId }),
    fields: "product,qty",
  });
  for (const it of items) {
    const productId = typeof it.product === "string" ? it.product : "";
    const qty = Number(it.qty ?? 0);
    if (!productId || !(qty > 0)) continue;
    try {
      const p = await pb.collection("products").getOne(productId, { fields: "stock" });
      const next = Math.max(0, Number(p.stock ?? 0) + direction * qty);
      await pb.collection("products").update(productId, { stock: next });
    } catch {
      // Товар удалён из каталога — списывать нечего, пропускаем позицию.
    }
  }
}
