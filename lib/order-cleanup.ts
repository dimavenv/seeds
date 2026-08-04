import "server-only";
import type PocketBase from "pocketbase";
import {
  DRAFTS_COLLECTION,
  materializePaidOrder,
  releasePaymentDraft,
  type PaymentDraft,
} from "@/lib/order-draft";

// Уборка протухших черновиков оплаты: покупатель ушёл с платёжной страницы и
// не заплатил. Заказа в базе при этом нет (он создаётся только после оплаты,
// см. lib/order-draft.ts) — но зарезервированные при оформлении товар и
// промокод вернуть надо, иначе они зависли бы навсегда (аудит 2.4,
// hoarding-DoS).
//
// Запускается двумя путями: оппортунистически при оформлении следующего заказа
// (см. /api/checkout) и по расписанию через /api/cron/cleanup — чтобы уборка не
// зависела от наличия трафика.
//
// ВАЖНО про безопасность оплаты: короткий TTL опасен тем, что можно снять
// резерв по счёту, который покупатель ПРЯМО СЕЙЧАС оплачивает. Защит две.
// Первая: счёт в Robokassa выставляется с ограниченным сроком действия
// (ExpirationDate = этот же TTL, см. lib/robokassa.ts) — после него оплатить
// его уже нельзя. Вторая: перед удалением спрашиваем у Robokassa состояние
// операции. Если деньги всё-таки получены, а уведомление об оплате не дошло —
// уборка не удаляет черновик, а достраивает по нему заказ.
export const DEFAULT_PENDING_TTL_MS = 20 * 60 * 1000; // 20 минут

export async function cleanupStalePaymentDrafts(
  pb: PocketBase,
  opts: { ttlMs?: number } = {}
): Promise<{ removed: number; rescued: number }> {
  const ttlMs = opts.ttlMs ?? DEFAULT_PENDING_TTL_MS;
  const cutoff = new Date(Date.now() - ttlMs)
    .toISOString()
    .replace("T", " "); // формат дат PocketBase

  const stale = await pb.collection(DRAFTS_COLLECTION).getFullList({
    filter: pb.filter("placed_at < {:cutoff}", { cutoff }),
  });

  let removed = 0;
  let rescued = 0;
  for (const rec of stale) {
    const invId = Number(rec.inv_id ?? 0);
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
      // Уведомление об оплате не дошло — достраиваем заказ сами.
      console.error(
        `[robokassa] счёт ${invId}: оплата подтверждена, но уведомление не дошло — заказ создан уборкой`
      );
      const done = await materializePaidOrder(pb, invId).catch((e) => {
        console.error(`[robokassa] счёт ${invId}: заказ создать не удалось:`, e);
        return null;
      });
      if (done) rescued++;
      continue;
    }

    const draft: PaymentDraft = {
      id: String(rec.id),
      invId,
      payload:
        typeof rec.payload === "string" ? JSON.parse(rec.payload) : rec.payload,
      promoUseId: (rec.promo_use as string | null) || null,
      placedAt: String(rec.placed_at ?? ""),
    };
    await releasePaymentDraft(pb, draft);
    removed++;
  }
  return { removed, rescued };
}
