import "server-only";
import type PocketBase from "pocketbase";
import { restockOrderItems } from "@/lib/stock";
import { releasePromoUseByOrder } from "@/lib/promo-server";

// Уборка зависших неоплаченных заказов ("пустышек"): покупатель ушёл с платёжной
// формы и callback от банка так и не пришёл. Такие заказы (новые, ждут оплаты
// дольше TTL) удаляем, а зарезервированный при оформлении товар возвращаем на
// склад (иначе он завис бы навсегда — аудит 2.4, hoarding-DoS).
//
// Запускается двумя путями: оппортунистически при оформлении следующего заказа
// (см. /api/checkout) и по расписанию через /api/cron/cleanup — чтобы уборка не
// зависела от наличия трафика.
//
// ВАЖНО про безопасность оплаты: короткий TTL опасен тем, что можно удалить
// заказ, по которому покупатель ПРЯМО СЕЙЧАС платит на форме банка (тогда
// callback об оплате не найдёт заказ — деньги списаны, заказа нет). Поэтому
// перед удалением заказа с alfa_order_id сверяемся с банком и НЕ трогаем заказ,
// если платёж в холде/оплачен; при недоступности статуса тоже не удаляем.
export const DEFAULT_PENDING_TTL_MS = 20 * 60 * 1000; // 20 минут

export async function cleanupStalePendingOrders(
  pb: PocketBase,
  opts: { ttlMs?: number } = {}
): Promise<number> {
  const ttlMs = opts.ttlMs ?? DEFAULT_PENDING_TTL_MS;
  const cutoff = new Date(Date.now() - ttlMs)
    .toISOString()
    .replace("T", " "); // формат дат PocketBase

  const stale = await pb.collection("orders").getFullList({
    filter: pb.filter(
      'status = "new" && payment_status = "pending" && placed_at < {:cutoff}',
      { cutoff }
    ),
    fields: "id,alfa_order_id",
  });

  let removed = 0;
  for (const o of stale) {
    const alfaId = String((o as { alfa_order_id?: unknown }).alfa_order_id ?? "");
    if (alfaId) {
      // Заказ привязан к платежу — убеждаемся, что деньги не в работе.
      try {
        const { isAlfaConfigured, alfaStatus } = await import("@/lib/alfa");
        if (isAlfaConfigured()) {
          const st = await alfaStatus(alfaId);
          // 1 — холд (идёт оплата), 2 — оплачен. Такой заказ не удаляем.
          if (st.orderStatus === 1 || st.orderStatus === 2) continue;
        }
      } catch {
        // Не смогли узнать статус — не рискуем удалять возможно оплаченный заказ.
        continue;
      }
    }
    // Возвращаем резерв на склад и удаляем состав + сам заказ. Промокод,
    // потраченный на этот заказ, тоже возвращаем покупателю: заказ не
    // состоялся, а код одноразовый.
    const items = await restockOrderItems(pb, o.id);
    await releasePromoUseByOrder(pb, o.id);
    for (const l of items) {
      await pb.collection("order_items").delete(l.id).catch(() => {});
    }
    await pb.collection("orders").delete(o.id).catch(() => {});
    removed++;
  }
  return removed;
}
