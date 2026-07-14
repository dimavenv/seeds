// Доставка фиксированная по России. Единый источник правды для checkout и API.
// По умолчанию 300 ₽. Для теста можно временно обнулить, задав в .env.production
//   NEXT_PUBLIC_DELIVERY_COST=0
// и пересобрав сайт (bash deploy/update.sh). Значение читается и на сервере
// (расчёт суммы заказа), и в браузере (страница оформления) — префикс
// NEXT_PUBLIC_ обязателен, иначе в браузер значение не попадёт. Чтобы вернуть
// платную доставку — убери строку из .env.production и пересобери.
function readDeliveryCost(): number {
  const n = Number(process.env.NEXT_PUBLIC_DELIVERY_COST);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

export const DELIVERY_COST = readDeliveryCost();

export const DELIVERY_METHODS = [
  { id: "ozon", label: "Ozon" },
  { id: "post", label: "Почта России" },
] as const;

export type DeliveryMethodId = (typeof DELIVERY_METHODS)[number]["id"];

// Подпись способа доставки по id (фолбэк — сам id).
export function deliveryMethodLabel(id: string | null | undefined): string {
  return DELIVERY_METHODS.find((m) => m.id === id)?.label ?? id ?? "—";
}

// Нормализация присланного способа доставки к допустимому значению.
export function normalizeDeliveryMethod(id: unknown): DeliveryMethodId {
  return DELIVERY_METHODS.some((m) => m.id === id)
    ? (id as DeliveryMethodId)
    : "ozon";
}
