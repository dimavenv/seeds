// Клиент подсказок адресов DaData. Единый источник для structured-адреса (Почта)
// и однострочного поля ПВЗ (Ozon). Токен публичный (сервис подсказок) — попадает
// в браузерный бандл, это нормально для DaData.

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

export const DADATA_TOKEN = process.env.NEXT_PUBLIC_DADATA_TOKEN;
export const hasDadata = Boolean(DADATA_TOKEN);

const SUGGEST_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

// Запрос подсказок адреса. Без токена/при ошибке возвращает пустой список,
// чтобы поля работали как обычный ручной ввод.
export async function suggestAddress(params: {
  query: string;
  count?: number;
  fromBound?: string;
  toBound?: string;
  locations?: object[];
  restrictValue?: boolean;
  signal?: AbortSignal;
}): Promise<DadataSuggestion[]> {
  if (!DADATA_TOKEN) return [];
  const {
    query,
    count = 7,
    fromBound,
    toBound,
    locations,
    restrictValue,
    signal,
  } = params;
  try {
    const res = await fetch(SUGGEST_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${DADATA_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        count,
        from_bound: fromBound ? { value: fromBound } : undefined,
        to_bound: toBound ? { value: toBound } : undefined,
        locations,
        restrict_value: restrictValue ?? Boolean(locations),
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
