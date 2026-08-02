import "server-only";
import type PocketBase from "pocketbase";
import {
  normalizePromoCode,
  promoCodesMatch,
  promoDiscount,
  promoLabel,
  promoStatus,
  type PromoRule,
} from "@/lib/promo";

// Серверная часть промокодов: какие коды действуют, на каких условиях и учёт
// использований. Клиенту список кодов не отдаётся — он только спрашивает «а
// такой код есть?» через POST /api/promo и получает описание скидки.
//
// Коды живут в коллекции `promos` и заводятся в админке (/admin/promos):
// процент или сумма скидки, срок действия, минимальная сумма заказа, лимит
// применений, «только для вошедших», «один раз на аккаунт», «только на первый
// заказ». Скидка всегда считается от суммы ТОВАРОВ — доставка не дешевеет.
//
// Учёт «один раз на аккаунт» — коллекция promo_uses: уникальный индекс на пару
// (user, code). Второй заказ с тем же кодом просто не пройдёт вставку — это и
// есть защита от гонки «два оформления в один момент», а не проверка «сначала
// посчитаем, потом запишем».
//
// Общий лимит применений (max_uses) считается по заказам с этим кодом. Это
// МЯГКОЕ ограничение: два одновременных оформления на последнем оставшемся
// применении оба пройдут проверку. Жёстким его делать не стали — цена вопроса
// одна лишняя скидка, а блокировка на каждое оформление стоила бы дороже.

export const PROMO_COLLECTION = "promo_uses";
export const PROMOS_COLLECTION = "promos";

// Полное описание кода — то, что видит и правит администратор.
export type PromoRecord = {
  id: string;
  code: string;
  percent: number;
  amount: number;
  minSubtotal: number;
  startsAt: string; // «ГГГГ-ММ-ДД» или «»
  expiresAt: string;
  enabled: boolean;
  authOnly: boolean;
  oncePerUser: boolean;
  firstOrderOnly: boolean;
  maxUses: number; // 0 — без ограничения
  note: string;
};

type Rec = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function mapPromo(r: Rec): PromoRecord {
  return {
    id: String(r.id ?? ""),
    code: normalizePromoCode(r.code),
    percent: Math.min(90, num(r.percent)),
    amount: num(r.amount),
    minSubtotal: num(r.min_subtotal),
    // Даты храним и сравниваем днями — см. promoDateKey в lib/promo.ts.
    startsAt: typeof r.starts_at === "string" ? r.starts_at.slice(0, 10) : "",
    expiresAt: typeof r.expires_at === "string" ? r.expires_at.slice(0, 10) : "",
    enabled: r.enabled !== false,
    authOnly: r.auth_only !== false,
    oncePerUser: r.once_per_user !== false,
    firstOrderOnly: r.first_order_only === true,
    maxUses: num(r.max_uses),
    note: typeof r.note === "string" ? r.note : "",
  };
}

export function promoToRule(p: PromoRecord): PromoRule {
  return {
    code: p.code,
    percent: p.percent,
    amount: p.amount,
    minSubtotal: p.minSubtotal,
    label: promoLabel(p),
  };
}

// ===== Запасной код из окружения =====
//
// До появления админки единственный код (УРОЖАЙ) задавался переменными
// окружения. Он остаётся рабочим, пока в базе нет НИ ОДНОГО кода: иначе после
// обновления магазин молча потерял бы действующую скидку. Как только продавец
// заведёт первый код в админке, окружение перестаёт учитываться — два
// источника правды хуже одного.
function envNumber(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

export function envPromo(): PromoRecord | null {
  if ((process.env.PROMO_HARVEST_ENABLED || "").trim().toLowerCase() === "false") {
    return null;
  }
  const percent = envNumber("PROMO_HARVEST_PERCENT", 10, 90);
  const amount = envNumber("PROMO_HARVEST_AMOUNT", 0, 100000);
  if (percent <= 0 && amount <= 0) return null; // скидка обнулена — кода нет
  return {
    id: "",
    code: "УРОЖАЙ",
    percent,
    amount,
    minSubtotal: envNumber("PROMO_HARVEST_MIN", 0, 1000000),
    startsAt: "",
    expiresAt: "",
    enabled: true,
    authOnly: true,
    oncePerUser: true,
    firstOrderOnly: false,
    maxUses: 0,
    note: "Код из переменных окружения (PROMO_HARVEST_*)",
  };
}

// Все коды — для админки. Порядок: сначала свежие.
export async function listPromos(pb: PocketBase): Promise<PromoRecord[]> {
  const list = await pb
    .collection(PROMOS_COLLECTION)
    .getFullList({ sort: "-created" });
  return list.map((r) => mapPromo(r as unknown as Rec));
}

// Код по названию. Возвращает запись в любом состоянии (выключенную, истёкшую)
// — решение о применимости принимает checkPromo.
export async function findPromoRecord(
  pb: PocketBase,
  code: unknown
): Promise<PromoRecord | null> {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;

  let records: PromoRecord[] = [];
  try {
    // Ищем по всем кодам, а не фильтром по равенству: коды сравниваются с
    // учётом похожих кириллических букв (promoCodesMatch), и «УРОЖАЙ» с
    // латинской «У» обязан найти тот же код. Кодов в магазине единицы.
    records = await listPromos(pb);
  } catch (e) {
    // Коллекции ещё нет (схему не импортировали) — работаем на запасном коде.
    console.error("[promo] не удалось прочитать список промокодов:", e);
    const fallback = envPromo();
    return fallback && promoCodesMatch(normalized, fallback.code) ? fallback : null;
  }

  if (records.length === 0) {
    const fallback = envPromo();
    return fallback && promoCodesMatch(normalized, fallback.code) ? fallback : null;
  }
  return records.find((r) => promoCodesMatch(normalized, r.code)) ?? null;
}

// Сколько заказов прошло с каждым кодом — «использовано» в админке.
// Отменённые заказы не считаем: продавец отменил заказ, значит применение
// вернулось. Одним запросом на все коды: заказов со скидкой немного.
export async function promoUsage(pb: PocketBase): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const list = await pb.collection("orders").getFullList({
      filter: 'promo_code != "" && status != "cancelled"',
      fields: "promo_code",
    });
    for (const r of list) {
      const code = normalizePromoCode((r as unknown as Rec).promo_code);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  } catch (e) {
    console.error("[promo] не удалось посчитать применения кодов:", e);
  }
  return counts;
}

// ===== Проверка кода =====
//
// ОДНА проверка на два места: корзина спрашивает «примут ли код» (без суммы),
// оформление — «примут ли на эту сумму». Раньше условия были разложены по
// обоим маршрутам, и любое новое правило приходилось помнить дважды.

export type PromoCheck =
  | { ok: true; record: PromoRecord; rule: PromoRule; discount: number }
  | { ok: false; status: number; error: string; needAuth?: boolean };

// Сколько раз кодом уже воспользовались. Считаем по заказам: так в лимит
// попадают и гостевые заказы, у которых нет записи в promo_uses.
async function countPromoOrders(pb: PocketBase, code: string): Promise<number | null> {
  try {
    const list = await pb.collection("orders").getList(1, 1, {
      filter: pb.filter('promo_code = {:c} && status != "cancelled"', { c: code }),
      fields: "id",
    });
    return list.totalItems;
  } catch (e) {
    console.error("[promo] не удалось посчитать применения кода:", e);
    return null;
  }
}

// Есть ли у покупателя хотя бы один заказ (для условия «только первый заказ»).
async function hasOrders(pb: PocketBase, userId: string): Promise<boolean | null> {
  try {
    const list = await pb.collection("orders").getList(1, 1, {
      filter: pb.filter('user = {:u} && status != "cancelled"', { u: userId }),
      fields: "id",
    });
    return list.totalItems > 0;
  } catch (e) {
    console.error("[promo] не удалось проверить прошлые заказы:", e);
    return null;
  }
}

const DB_DOWN = {
  ok: false as const,
  status: 503,
  error: "База не отвечает — попробуйте ещё раз",
};

export async function checkPromo(
  pb: PocketBase,
  opts: {
    code: unknown;
    userId: string | null;
    // Сумма товаров. undefined — проверяем всё, кроме порога и размера скидки
    // (корзина спрашивает до того, как сумма стала окончательной).
    subtotal?: number;
  }
): Promise<PromoCheck> {
  const record = await findPromoRecord(pb, opts.code);
  // Выключенный, ещё не начавшийся и истёкший код неотличимы от несуществующего
  // — покупателю ни к чему знать, что код существует, но «не для него».
  if (!record || promoStatus(record) !== "active") {
    return {
      ok: false,
      status: 404,
      error: "Такого промокода нет или он больше не действует",
    };
  }

  if (record.authOnly && !opts.userId) {
    return {
      ok: false,
      status: 401,
      needAuth: true,
      error:
        "Промокод действует только для покупателей с аккаунтом. Войдите в свой аккаунт (или зарегистрируйтесь) и примените код ещё раз.",
    };
  }

  if (record.oncePerUser && opts.userId) {
    const used = await isPromoUsed(pb, opts.userId, record.code);
    if (used === null) return DB_DOWN;
    if (used) {
      return {
        ok: false,
        status: 409,
        error: "Этот промокод уже использован на вашем аккаунте",
      };
    }
  }

  if (record.firstOrderOnly && opts.userId) {
    const already = await hasOrders(pb, opts.userId);
    if (already === null) return DB_DOWN;
    if (already) {
      return {
        ok: false,
        status: 409,
        error: "Промокод действует только на первый заказ",
      };
    }
  }

  if (record.maxUses > 0) {
    const used = await countPromoOrders(pb, record.code);
    if (used === null) return DB_DOWN;
    if (used >= record.maxUses) {
      return {
        ok: false,
        status: 409,
        error: "Промокод больше не действует: закончились применения",
      };
    }
  }

  const rule = promoToRule(record);
  if (opts.subtotal === undefined) {
    return { ok: true, record, rule, discount: 0 };
  }

  if (opts.subtotal < record.minSubtotal) {
    return {
      ok: false,
      status: 400,
      error: `Промокод действует при сумме товаров от ${record.minSubtotal} ₽`,
    };
  }

  const discount = promoDiscount(rule, opts.subtotal);
  // Нулевая скидка (например, копеечный заказ при скидке в процентах) —
  // отказываем сразу: иначе одноразовый код сгорел бы впустую.
  if (discount <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Промокод не даёт скидку на эту сумму заказа",
    };
  }

  return { ok: true, record, rule, discount };
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
