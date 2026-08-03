import "server-only";
import type PocketBase from "pocketbase";
import { restockOrderItems } from "@/lib/stock";
import { restoreUserCart } from "@/lib/user-cart";
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
// заказ, по которому покупатель ПРЯМО СЕЙЧАС платит на платёжной странице
// (тогда уведомление об оплате не найдёт заказ — деньги списаны, заказа нет).
// Защит две. Первая: счёт в Robokassa выставляется с ограниченным сроком
// действия (ExpirationDate = этот же TTL, см. lib/robokassa.ts) — после него
// оплатить его уже нельзя. Вторая: перед удалением спрашиваем у Robokassa
// состояние операции и НЕ трогаем заказ, если деньги в работе; при
// недоступности сервиса тоже не удаляем.
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
    fields: "id,number,user",
  });

  let removed = 0;
  for (const o of stale) {
    // Номер заказа — он же номер счёта (InvId) в Robokassa: спрашиваем, что
    // с деньгами по этому счёту.
    const invId = Number((o as { number?: unknown }).number ?? 0);
    if (Number.isInteger(invId) && invId > 0) {
      try {
        const { isRobokassaConfigured, robokassaOpState, isMoneyInvolvedState } =
          await import("@/lib/robokassa");
        if (isRobokassaConfigured()) {
          const state = await robokassaOpState(invId);
          // Деньги получены/возвращены/зависли — такой заказ не удаляем.
          if (isMoneyInvolvedState(state)) continue;
        }
      } catch {
        // Не смогли узнать состояние — не рискуем удалять возможно оплаченный
        // заказ. Уборка повторится при следующем запуске.
        continue;
      }
    }
    // Возвращаем резерв на склад и удаляем состав + сам заказ. Промокод,
    // потраченный на этот заказ, тоже возвращаем покупателю: заказ не
    // состоялся, а код одноразовый.
    const items = await restockOrderItems(pb, o.id);
    // Вошедшему покупателю возвращаем состав в серверную корзину — заказ не
    // состоялся, товары не должны пропасть (у гостя корзина в localStorage и
    // с сервера недостижима).
    if (typeof o.user === "string" && o.user) {
      await restoreUserCart(pb, o.user, items);
    }
    await releasePromoUseByOrder(pb, o.id);
    for (const l of items) {
      await pb.collection("order_items").delete(l.id).catch(() => {});
    }
    await pb.collection("orders").delete(o.id).catch(() => {});
    removed++;
  }
  return removed;
}
