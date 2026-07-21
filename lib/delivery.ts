// Доставка по России. Единый источник правды для корзины, checkout и API.
// Базовая стоимость 300 ₽; Почтой России — бесплатно при заказе от 3000 ₽.
// Для теста значения можно переопределить в .env.production и пересобрать сайт
// (bash deploy/update.sh):
//   NEXT_PUBLIC_DELIVERY_COST=0        — обнулить базовую стоимость
//   NEXT_PUBLIC_FREE_DELIVERY_FROM=0   — порог бесплатной доставки Почтой
// Значения читаются и на сервере (расчёт суммы заказа), и в браузере (корзина,
// оформление) — префикс NEXT_PUBLIC_ обязателен, иначе в браузер не попадут.
function readEnvNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const DELIVERY_COST = readEnvNumber(
  process.env.NEXT_PUBLIC_DELIVERY_COST,
  300
);

// От какой суммы товаров доставка бесплатна (любым способом).
export const FREE_DELIVERY_FROM = readEnvNumber(
  process.env.NEXT_PUBLIC_FREE_DELIVERY_FROM,
  3000
);

export const DELIVERY_METHODS = [
  {
    id: "ozon",
    label: "Ozon",
    title: "OZON",
    subtitle: "В пункт выдачи",
    hint: "В пункт выдачи Ozon — быстро и удобно",
    icon: "/dostavka-ozon.png",
    days: "2–5 дней",
    freeFrom: FREE_DELIVERY_FROM,
  },
  {
    id: "post",
    label: "Почта России",
    title: "ПОЧТА РОССИИ",
    subtitle: "В отделение",
    hint: "Доставка на ваш домашний адрес",
    icon: "/dostavka-pochta.png",
    days: "2–5 дней",
    freeFrom: FREE_DELIVERY_FROM,
  },
] as const;

export type DeliveryMethodId = (typeof DELIVERY_METHODS)[number]["id"];
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

// Стоимость доставки выбранным способом при данной сумме товаров.
// Почта России — бесплатно от FREE_DELIVERY_FROM, Ozon — всегда DELIVERY_COST.
export function deliveryCostFor(
  id: DeliveryMethodId,
  subtotal: number
): number {
  const method = DELIVERY_METHODS.find((m) => m.id === id);
  if (method?.freeFrom != null && subtotal >= method.freeFrom) return 0;
  return DELIVERY_COST;
}

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

// Регионы, в которые Ozon-доставку оформить нельзя (Крым, Калининград,
// Камчатка). Проверяем по ключевым словам в написанном покупателем адресе
// пункта выдачи — и на странице оформления, и на сервере (клиенту не доверяем).
const OZON_RESTRICTED_REGIONS: { name: string; keywords: string[] }[] = [
  {
    name: "Республика Крым / Севастополь",
    keywords: [
      "крым",
      "севастополь",
      "симферополь",
      "керчь",
      "ялта",
      "евпатория",
      "феодосия",
      "джанкой",
    ],
  },
  {
    name: "Калининградская область",
    keywords: ["калининград", "калининградск"],
  },
  {
    name: "Камчатский край",
    keywords: ["камчат", "петропавловск-камчат"],
  },
];

// Если написанный адрес попадает в запрещённый для Ozon регион — вернуть его
// название (для сообщения об ошибке), иначе null.
export function ozonRestrictedRegion(address: string | null | undefined): string | null {
  const text = (address ?? "").toLowerCase();
  if (!text.trim()) return null;
  for (const region of OZON_RESTRICTED_REGIONS) {
    if (region.keywords.some((k) => text.includes(k))) return region.name;
  }
  return null;
}
