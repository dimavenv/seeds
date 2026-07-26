import "server-only";
import type { DadataSuggestion } from "@/lib/dadata";

// Серверная сторона подсказок DaData. Токен живёт ТОЛЬКО здесь и никогда не
// попадает в браузер (аудит 5.5). Для обратной совместимости принимаем и
// прежний публичный ключ, но правильная настройка — серверный DADATA_TOKEN.
const TOKEN = process.env.DADATA_TOKEN || process.env.NEXT_PUBLIC_DADATA_TOKEN || "";

export function hasServerDadata(): boolean {
  return Boolean(TOKEN);
}

const SUGGEST_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

export async function fetchAddressSuggestions(params: {
  query: string;
  count?: number;
  fromBound?: string;
  toBound?: string;
  locations?: object[];
  restrictValue?: boolean;
}): Promise<DadataSuggestion[]> {
  if (!TOKEN) return [];
  const { query, count = 7, fromBound, toBound, locations, restrictValue } = params;
  try {
    const res = await fetch(SUGGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${TOKEN}`,
      },
      body: JSON.stringify({
        query,
        count,
        from_bound: fromBound ? { value: fromBound } : undefined,
        to_bound: toBound ? { value: toBound } : undefined,
        locations,
        restrict_value: restrictValue ?? Boolean(locations),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { suggestions?: DadataSuggestion[] };
    return json.suggestions ?? [];
  } catch {
    return [];
  }
}
