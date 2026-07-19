import type PocketBase from "pocketbase";

// Списание/возврат остатков товара. Через REST-API PocketBase транзакций нет,
// поэтому это read-modify-write: короткая гонка двух одновременных заказов
// возможна, но проверка наличия при оформлении и потолок количества на
// позицию сводят её последствия к минимуму. Ошибки по отдельным товарам
// (например, товар удалён) не прерывают обработку остальных.
export async function adjustStock(
  pb: PocketBase,
  deltas: { productId: string; delta: number }[]
): Promise<void> {
  for (const { productId, delta } of deltas) {
    if (!delta) continue;
    try {
      const rec = await pb
        .collection("products")
        .getOne(productId, { fields: "id,stock" });
      const current = typeof rec.stock === "number" ? rec.stock : 0;
      await pb
        .collection("products")
        .update(productId, { stock: Math.max(0, current + delta) });
    } catch (e) {
      console.error(`[stock] не удалось изменить остаток товара ${productId} на ${delta}:`, e);
    }
  }
}

// Вернуть на склад состав заказа (перед удалением «несостоявшегося» заказа).
// Возвращает записи состава — их же можно использовать для удаления.
export async function restockOrderItems(
  pb: PocketBase,
  orderId: string
): Promise<{ id: string }[]> {
  const items = await pb
    .collection("order_items")
    .getFullList({
      filter: pb.filter("order = {:id}", { id: orderId }),
      fields: "id,product,qty",
    })
    .catch(() => [] as { id: string; product?: unknown; qty?: unknown }[]);
  await adjustStock(
    pb,
    items
      .filter((i) => typeof i.product === "string" && i.product)
      .map((i) => ({ productId: String(i.product), delta: Number(i.qty) || 0 }))
  );
  return items.map((i) => ({ id: i.id }));
}
