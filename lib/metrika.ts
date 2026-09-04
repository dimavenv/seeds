// Цели и электронная коммерция Яндекс.Метрики — тонкая обёртка над `ym()`.
//
// Зачем обёртка, а не вызовы ym() по месту:
//  - счётчик подключается только когда задан NEXT_PUBLIC_YANDEX_METRIKA_ID
//    (см. components/analytics.tsx). Без него window.ym нет вообще, и голый
//    вызов уронил бы обработчик клика — здесь же всё тихо игнорируется;
//  - имена целей собраны в одном месте: их нужно один в один завести в
//    интерфейсе Метрики (см. SETUP-ANALYTICS-RU.md и подсказку в /admin/analytics),
//    а разъехавшиеся строки — самая частая причина «цель не считается»;
//  - блокировщики рекламы вырезают tag.js: любое обращение к счётчику может
//    бросить исключение, поэтому всё завёрнуто в try/catch. Аналитика никогда
//    не должна ломать покупку.
//
// Файл браузерный (никакого server-only): его импортируют клиентские
// компоненты. Чистые сборщики payload вынесены отдельно и покрыты тестами.

export const METRIKA_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim() || "";

// Идентификаторы целей. Ровно эти строки заводятся в Метрике как цели типа
// «JavaScript-событие». Значения менять нельзя без правки настроек счётчика —
// иначе накопленная статистика по цели оборвётся.
export const GOALS = {
  addToCart: "add_to_cart",
  removeFromCart: "remove_from_cart",
  addToFavorites: "add_to_favorites",
  search: "search",
  beginCheckout: "begin_checkout",
  submitOrder: "submit_order",
  purchase: "purchase",
  paymentFailed: "payment_failed",
  promoApplied: "promo_applied",
  login: "login",
  supportRequest: "support_request",
  reviewSubmit: "review_submit",
} as const;

export type Goal = (typeof GOALS)[keyof typeof GOALS];

// Человеческие описания — показываются в админке (/admin/analytics) как
// готовая инструкция «какие цели создать» и используются в документации.
export const GOAL_DESCRIPTIONS: Record<Goal, string> = {
  add_to_cart: "Товар добавлен в корзину",
  remove_from_cart: "Товар удалён из корзины",
  add_to_favorites: "Товар добавлен в избранное",
  search: "Поиск по каталогу",
  begin_checkout: "Открыта страница оформления заказа",
  submit_order: "Нажата кнопка «Оформить заказ»",
  purchase: "Заказ оформлен (главная цель, с ценностью в ₽)",
  payment_failed: "Оплата не прошла",
  promo_applied: "Применён промокод",
  login: "Вход в аккаунт",
  support_request: "Отправлена заявка в поддержку",
  review_submit: "Отправлен отзыв о магазине",
};

type YmFn = (id: string, action: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    ym?: YmFn;
    dataLayer?: unknown[];
  }
}

// --- Цели -------------------------------------------------------------------

// Достижение цели. params попадают в отчёт «Параметры визита»; для цели
// purchase туда же кладём ценность заказа (order_price + currency) — тогда
// Метрика показывает выручку по цели, а не только число достижений.
export function reachGoal(goal: Goal, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !METRIKA_ID) return;
  try {
    window.ym?.(METRIKA_ID, "reachGoal", goal, params);
  } catch {
    // счётчик вырезан блокировщиком — молча пропускаем
  }
}

// Цель + переход на другую страницу. Жёсткий переход (window.location.assign)
// обрывает незавершённые запросы, поэтому вход ждёт ответа
// счётчика — но не дольше MAX_GOAL_WAIT_MS: подвиснуть на аналитике страница
// входа не имеет права. Продолжение вызывается ровно один раз (что бы ни
// сработало первым — колбэк Метрики или таймаут).
const MAX_GOAL_WAIT_MS = 400;

export function reachGoalThen(
  goal: Goal,
  params: Record<string, unknown> | undefined,
  next: () => void
): void {
  if (typeof window === "undefined" || !METRIKA_ID || !window.ym) {
    next();
    return;
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    next();
  };
  const timer = setTimeout(go, MAX_GOAL_WAIT_MS);
  try {
    window.ym(METRIKA_ID, "reachGoal", goal, params, () => {
      clearTimeout(timer);
      go();
    });
  } catch {
    clearTimeout(timer);
    go();
  }
}

// --- Электронная коммерция --------------------------------------------------

export type EcomProduct = {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
};

export type EcomAction = "detail" | "add" | "remove" | "purchase";

export type EcomActionField = {
  id?: string; // номер заказа — только для purchase
  revenue?: number; // сумма заказа, ₽
  coupon?: string; // применённый промокод
};

// Чистый сборщик слоя данных в формате Яндекс.Метрики (совместим с GA-подобной
// схемой Enhanced Ecommerce, которую Метрика и понимает). Вынесен отдельно,
// чтобы форму сообщения можно было проверить тестом без браузера.
export function ecommercePayload(
  action: EcomAction,
  products: EcomProduct[],
  actionField?: EcomActionField
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      quantity: p.quantity ?? 1,
      ...(p.category ? { category: p.category } : {}),
    })),
  };
  // actionField с пустыми полями Метрика игнорирует, но мусор в слое данных
  // мешает отладке — добавляем только когда есть что положить.
  if (actionField && Object.values(actionField).some((v) => v !== undefined)) {
    body.actionField = actionField;
  }
  return { ecommerce: { currencyCode: "RUB", [action]: body } };
}

// Отправка в dataLayer. Имя массива задано при инициализации счётчика
// (ecommerce:"dataLayer" в components/analytics.tsx) — если поменять там,
// нужно поменять и здесь.
export function pushEcommerce(
  action: EcomAction,
  products: EcomProduct[],
  actionField?: EcomActionField
): void {
  if (typeof window === "undefined" || !METRIKA_ID) return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(ecommercePayload(action, products, actionField));
  } catch {
    // см. комментарий в reachGoal
  }
}

// --- Покупка через платёжную форму ------------------------------------------

// Состав заказа известен на странице оформления, а цель «покупка» правильно
// засчитывать уже после возврата с платёжной страницы Robokassa (иначе в статистику
// попадут неоплаченные заказы). Между этими двумя моментами браузер уходит на
// чужой домен, поэтому состав переживает переход в sessionStorage.
const PURCHASE_KEY = "metrika_purchase";

export type PendingPurchase = {
  orderId: string;
  revenue: number;
  coupon?: string;
  products: EcomProduct[];
};

export function stashPurchase(purchase: PendingPurchase): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PURCHASE_KEY, JSON.stringify(purchase));
  } catch {
    // приватный режим — покупка просто не попадёт в ecommerce-отчёт
  }
}

// Забрать и сразу удалить: цель не должна засчитаться второй раз, если
// покупатель обновит страницу «спасибо» или вернётся на неё из истории.
export function takePurchase(): PendingPurchase | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PURCHASE_KEY);
    sessionStorage.removeItem(PURCHASE_KEY);
    return raw ? (JSON.parse(raw) as PendingPurchase) : null;
  } catch {
    return null;
  }
}

export function dropPurchase(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PURCHASE_KEY);
  } catch {}
}
