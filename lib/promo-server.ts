import "server-only";
import type PocketBase from "pocketbase";
import { promoCodesMatch, type PromoRule } from "@/lib/promo";

// Серверная часть промокодов: какие коды действуют и учёт «один раз на
// аккаунт». Клиенту список кодов не отдаётся — он только спрашивает «а такой
// код есть?» через POST /api/promo и получает описание скидки.
//
// ЕДИНСТВЕННЫЙ действующий код — УРОЖАЙ:
//   • только для вошедших в аккаунт (гость получает подсказку «войдите»);
//   • ровно один раз на аккаунт (гарантирует уникальный индекс в БД, см. ниже);
//   • скидка считается от суммы ТОВАРОВ, доставка не дешевеет.
//
// Размер скидки меняется без правки кода — в .env.production и перезапуск
// (bash deploy/update.sh):
//   PROMO_HARVEST_PERCENT=10   скидка в процентах на товары (по умолчанию 10)
//   PROMO_HARVEST_MIN=0        минимальная сумма товаров, ₽ (0 — без порога)
//   PROMO_HARVEST_ENABLED=false выключить код совсем (по умолчанию включён)
//
// Учёт использований — коллекция promo_uses (pocketbase/pb_schema.json):
// уникальный индекс на пару (user, code). Второй заказ с тем же кодом просто
// не пройдёт вставку — это и есть защита от гонки «два оформления в один
// момент», а не проверка «сначала посчитаем, потом запишем».

export const PROMO_COLLECTION = "promo_uses";

function envNumber(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

// Действующие правила. Пересчитываются на каждый вызов: значения берутся из
// окружения, а его читает уже запущенный процесс (кэш только запутал бы).
export function promoRules(): PromoRule[] {
  if ((process.env.PROMO_HARVEST_ENABLED || "").trim().toLowerCase() === "false") {
    return [];
  }
  const percent = envNumber("PROMO_HARVEST_PERCENT", 10, 90);
  const amount = envNumber("PROMO_HARVEST_AMOUNT", 0, 100000);
  const minSubtotal = envNumber("PROMO_HARVEST_MIN", 0, 1000000);
  if (percent <= 0 && amount <= 0) return []; // скидка обнулена — кода нет
  return [
    {
      code: "УРОЖАЙ",
      percent,
      amount,
      minSubtotal,
      label:
        percent > 0
          ? `−${percent}% на товары`
          : `−${amount} ₽ на заказ`,
    },
  ];
}

export function findPromoRule(code: unknown): PromoRule | null {
  return promoRules().find((r) => promoCodesMatch(code, r.code)) ?? null;
}

// ===== Учёт «один раз на аккаунт» =====

export type PromoReserveResult =
  // Код закреплён за аккаунтом: id записи нужен для отката (releasePromoUse).
  | { status: "reserved"; id: string }
  // Этот аккаунт уже использовал код.
  | { status: "used" }
  // База не ответила. Скидку в этом случае НЕ даём: без записи об
  // использовании код стал бы многоразовым.
  | { status: "error" };

// Закрепить код за аккаунтом. Вызывать ДО создания заказа: если заказ не
// сложится, запись снимается (releasePromoUse).
export async function reservePromoUse(
  pb: PocketBase,
  userId: string,
  code: string
): Promise<PromoReserveResult> {
  try {
    const rec = await pb.collection(PROMO_COLLECTION).create({
      user: userId,
      code,
      used_at: new Date().toISOString(),
    });
    return { status: "reserved", id: rec.id };
  } catch (e) {
    // 400 от PocketBase на вставке — сработал уникальный индекс (user, code):
    // код уже использован этим аккаунтом. Всё остальное — сбой базы.
    if ((e as { status?: number })?.status === 400) return { status: "used" };
    console.error("[promo] не удалось закрепить промокод за аккаунтом:", e);
    return { status: "error" };
  }
}

// Снять резерв (заказ не создался, платёж не зарегистрировался и т.п.).
export async function releasePromoUse(
  pb: PocketBase,
  useId: string
): Promise<void> {
  await pb
    .collection(PROMO_COLLECTION)
    .delete(useId)
    .catch((e) => {
      console.error(`[promo] не удалось снять резерв промокода ${useId}:`, e);
    });
}

// Привязать использование к созданному заказу — по ней же промокод
// возвращается покупателю, если заказ потом удалят (неоплаченный).
export async function attachPromoUseToOrder(
  pb: PocketBase,
  useId: string,
  orderId: string
): Promise<void> {
  await pb
    .collection(PROMO_COLLECTION)
    .update(useId, { order: orderId })
    .catch((e) => {
      console.error(
        `[promo] не удалось привязать промокод ${useId} к заказу ${orderId}:`,
        e
      );
    });
}

// Вернуть промокод покупателю вместе с удалением заказа: неоплаченный заказ
// удаляется (callback банка или уборка зависших), и «сгоревший» на нём код
// иначе пропал бы навсегда.
export async function releasePromoUseByOrder(
  pb: PocketBase,
  orderId: string
): Promise<void> {
  try {
    const uses = await pb.collection(PROMO_COLLECTION).getFullList({
      filter: pb.filter("order = {:id}", { id: orderId }),
      fields: "id",
    });
    for (const u of uses) await releasePromoUse(pb, u.id);
  } catch (e) {
    console.error(`[promo] не удалось вернуть промокод заказа ${orderId}:`, e);
  }
}

// Использовал ли аккаунт этот код. null — база не ответила (в интерфейсе
// показываем «попробуйте ещё раз», при оформлении решает reservePromoUse).
export async function isPromoUsed(
  pb: PocketBase,
  userId: string,
  code: string
): Promise<boolean | null> {
  try {
    const list = await pb.collection(PROMO_COLLECTION).getList(1, 1, {
      filter: pb.filter("user = {:u} && code = {:c}", { u: userId, c: code }),
      fields: "id",
    });
    return list.totalItems > 0;
  } catch (e) {
    console.error("[promo] не удалось проверить использование промокода:", e);
    return null;
  }
}
