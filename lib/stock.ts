import type PocketBase from "pocketbase";

// ===== Атомарное резервирование остатков =====
//
// Основной путь — Batch API PocketBase: все списания одного заказа уходят
// одной транзакцией с модификатором поля «stock-», а min: 0 на products.stock
// (pb_schema.json) не даёт увести остаток в минус — валидация отбивает
// транзакцию ЦЕЛИКОМ, внутри самого PocketBase. Конкурентные заказы
// сериализуются на блокировке записи SQLite, «проигравший» получает 400 —
// это и есть атомарная проверка-и-списание без гонки read-then-write.
//
// Если Batch API на сервере не включён (403 — забыли перезапустить
// npm run db:schema), громко пишем в лог и откатываемся на старое
// неатомарное списание adjustStock: поведение сайта не ломается.

export type ReserveLine = { productId: string; qty: number };

// "conflict" — остатка не хватило (или товар исчез): транзакция откатена,
// ничего не списано; покупателю следует вернуть 409.
export type ReserveOutcome = "reserved" | "conflict";

export async function reserveStock(
  pb: PocketBase,
  rawLines: ReserveLine[]
): Promise<ReserveOutcome> {
  const lines = rawLines.filter((l) => l.qty > 0);
  if (lines.length === 0) return "reserved";
  try {
    const batch = pb.createBatch();
    for (const l of lines) {
      batch.collection("products").update(l.productId, { "stock-": l.qty });
    }
    await batch.send();
    return "reserved";
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 400) return "conflict"; // не хватило остатка — откат всей транзакции
    console.error(
      "[stock] Batch API недоступен (включается через npm run db:schema) — списание неатомарным фолбэком:",
      e
    );
    await adjustStock(pb, lines.map((l) => ({ productId: l.productId, delta: -l.qty })));
    return "reserved";
  }
}

// Вернуть резерв (откат заказа: не создался платёж, оплата не прошла и т.п.).
// Инкремент без ограничений сверху, поэтому 400 здесь не ожидается; при
// недоступном Batch API — тот же фолбэк.
export async function releaseStock(
  pb: PocketBase,
  rawLines: ReserveLine[]
): Promise<void> {
  const lines = rawLines.filter((l) => l.qty > 0);
  if (lines.length === 0) return;
  try {
    const batch = pb.createBatch();
    for (const l of lines) {
      batch.collection("products").update(l.productId, { "stock+": l.qty });
    }
    await batch.send();
  } catch (e) {
    console.error("[stock] batch-возврат остатков не прошёл, фолбэк:", e);
    await adjustStock(pb, lines.map((l) => ({ productId: l.productId, delta: l.qty })));
  }
}

// ===== Неатомарный фолбэк =====
//
// Read-modify-write; используется, только когда Batch API недоступен.
// Ошибки по отдельным товарам (например, товар удалён) не прерывают
// обработку остальных.
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
// Возвращает записи состава (id, товар, количество) — по ним же callback
// удаляет позиции и восстанавливает корзину покупателя.
export type RestockedItem = { id: string; product: string | null; qty: number };

export async function restockOrderItems(
  pb: PocketBase,
  orderId: string
): Promise<RestockedItem[]> {
  const items = await pb
    .collection("order_items")
    .getFullList({
      filter: pb.filter("order = {:id}", { id: orderId }),
      fields: "id,product,qty",
    })
    .catch(() => [] as { id: string; product?: unknown; qty?: unknown }[]);
  await releaseStock(
    pb,
    items
      .filter((i) => typeof i.product === "string" && i.product)
      .map((i) => ({ productId: String(i.product), qty: Number(i.qty) || 0 }))
  );
  return items.map((i) => ({
    id: i.id,
    product: typeof i.product === "string" && i.product ? i.product : null,
    qty: Number(i.qty) || 0,
  }));
}
