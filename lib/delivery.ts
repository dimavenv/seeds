// Доставка фиксированная по России. Единый источник правды для checkout и API.
export const DELIVERY_COST = 300;

export const DELIVERY_METHODS = [
  {
    id: "ozon",
    label: "Ozon",
    hint: "В пункт выдачи Ozon — быстро и удобно",
  },
  {
    id: "post",
    label: "Почта России",
    hint: "Доставка на ваш домашний адрес",
  },
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
