// Клиентский помощник подсказок адресов DaData. Единый источник для
// structured-адреса (Почта) и однострочного поля ПВЗ (Ozon).
//
// ВАЖНО (аудит 5.5): токен DaData больше НЕ уходит в браузер. Запросы идут через
// собственный серверный прокси /api/dadata (app/api/dadata/route.ts +
// lib/dadata-server.ts), который подставляет ключ на сервере и троттлит запросы,
// чтобы ключ нельзя было выскрести из бандла и сжечь квоту.

// Ответ DaData (suggestions API). Берём только нужные поля.
export type DadataAddressData = {
  postal_code: string | null;
  region_with_type: string | null;
  city_with_type: string | null;
  settlement_with_type: string | null;
  street_with_type: string | null;
  house: string | null;
  // Нормализованные идентификаторы региона — устойчивая замена разбора
  // свободного текста (аудит 2.6): region_kladr_id начинается с 2-значного
  // кода региона (91 — Крым, 92 — Севастополь, 39 — Калининград, 41 — Камчатка).
  region_kladr_id: string | null;
  region_fias_id: string | null;
  city_fias_id: string | null;
  settlement_fias_id: string | null;
  street_fias_id: string | null;
};

export type DadataSuggestion = { value: string; data: DadataAddressData };

// Включены ли подсказки. Только публичный НЕсекретный флаг
// NEXT_PUBLIC_DADATA_ENABLED — намеренно НЕ ссылаемся здесь на токен, иначе
// Next вшил бы его значение в браузерный бандл (ровно то, от чего уходим,
// аудит 5.5). При миграции задайте DADATA_TOKEN (сервер) и
// NEXT_PUBLIC_DADATA_ENABLED=1 (браузер).
export const hasDadata = Boolean(process.env.NEXT_PUBLIC_DADATA_ENABLED);

// Запрос подсказок адреса через собственный прокси. Без подсказок/при ошибке
// возвращает пустой список, чтобы поля работали как обычный ручной ввод.
export async function suggestAddress(params: {
  query: string;
  count?: number;
  fromBound?: string;
  toBound?: string;
  locations?: object[];
  restrictValue?: boolean;
  signal?: AbortSignal;
}): Promise<DadataSuggestion[]> {
  if (!hasDadata) return [];
  const { query, count = 7, fromBound, toBound, locations, restrictValue, signal } =
    params;
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch("/api/dadata", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        count,
        fromBound,
        toBound,
        locations,
        restrictValue,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { suggestions?: DadataSuggestion[] };
    return json.suggestions ?? [];
  } catch {
    // отменённый/сетевой запрос — игнорируем
    return [];
  }
}
