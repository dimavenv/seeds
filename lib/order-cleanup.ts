import "server-only";
import type PocketBase from "pocketbase";
import { failPendingOrder, markOrderPaid, toOrderRecord } from "@/lib/order-flow";

// Уборка зависших попыток оплаты: покупатель ушёл с платёжной страницы и не
// заплатил. Сам заказ при этом остаётся в базе (продавец видит его как «не
// оплачен», покупатель может оплатить позже) — но зарезервированный при
// оформлении товар надо вернуть в продажу, иначе он завис бы навсегда
// (аудит 2.4, hoarding-DoS).
//
// Запускается двумя путями: оппортунистически при оформлении следующего заказа
// (см. /api/checkout) и по расписанию через /api/cron/cleanup — чтобы уборка не
// зависела от наличия трафика.
//
// ВАЖНО про безопасность оплаты: короткий TTL опасен тем, что можно снять
// резерв по счёту, который покупатель ПРЯМО СЕЙЧАС оплачивает. Защит две.
// Первая: счёт в Robokassa выставляется с ограниченным сроком действия
// (ExpirationDate = этот же TTL, см. lib/robokassa.ts) — после него оплатить
// его уже нельзя. Вторая: перед снятием резерва спрашиваем у Robokassa
// состояние операции. Если деньги всё-таки получены, а уведомление об оплате не
// дошло — уборка сама помечает заказ оплаченным.
export const DEFAULT_PENDING_TTL_MS = 20 * 60 * 1000; // 20 минут

export async function cleanupStalePendingOrders(
  pb: PocketBase,
  opts: { ttlMs?: number } = {}
): Promise<{ released: number; rescued: number }> {
  const ttlMs = opts.ttlMs ?? DEFAULT_PENDING_TTL_MS;
  const cutoff = new Date(Date.now() - ttlMs)
    .toISOString()
    .replace("T", " "); // формат дат PocketBase

  const stale = await pb.collection("orders").getFullList({
    filter: pb.filter(
      'payment_status = "pending" && pay_started_at != "" && pay_started_at < {:cutoff}',
      { cutoff }
    ),
  });

  let released = 0;
  let rescued = 0;
  for (const rec of stale) {
    const order = toOrderRecord(rec as unknown as Record<string, unknown>);
    const invId = order.invoiceId ?? 0;
    let paid = false;
    if (Number.isInteger(invId) && invId > 0) {
      try {
        const {
          isRobokassaConfigured,
          robokassaOpState,
          isPaidState,
          isMoneyInvolvedState,
        } = await import("@/lib/robokassa");
        if (isRobokassaConfigured()) {
          const state = await robokassaOpState(invId);
          paid = isPaidState(state);
          // Деньги в работе (операция приостановлена, идёт возврат) — не
          // трогаем: разберёмся при следующем запуске или вручную.
          if (!paid && isMoneyInvolvedState(state)) continue;
        }
      } catch {
        // Не смогли узнать состояние — не рискуем снимать резерв по счёту,
        // который могли оплатить. Уборка повторится при следующем запуске.
        continue;
      }
    }

    if (paid) {
      // Уведомление об оплате не дошло — подтверждаем оплату сами.
      console.error(
        `[robokassa] счёт ${invId}: оплата подтверждена, но уведомление не дошло — заказ №${order.number} помечен оплаченным уборкой`
      );
      const done = await markOrderPaid(pb, invId).catch((e) => {
        console.error(`[robokassa] счёт ${invId}: подтвердить оплату не удалось:`, e);
        return null;
      });
      if (done) rescued++;
      continue;
    }

    await failPendingOrder(pb, order);
    released++;
  }
  return { released, rescued };
}
