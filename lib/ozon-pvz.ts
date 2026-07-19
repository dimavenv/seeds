// Источник пунктов выдачи Ozon (ПВЗ) для выбора на карте при оформлении.
//
// Ozon Seller API (импорт товаров) НЕ отдаёт клиентский справочник ПВЗ.
// Точки выдачи даёт «Ozon Доставка» через Ozon Logistic Platform API —
// метод v1/delivery/point/list (список ПВЗ/постаматов), см.
// https://docs.ozon.ru/api/logistic-platform/. «Ozon Rocket» — прежнее
// название, проект закрыт.
//
// Чтобы не хардкодить эндпоинт (базовый хост/схема зависят от договора), адрес и
// авторизация берутся из переменных окружения:
//
//   OZON_PVZ_API_URL   — полный URL метода point/list (GET/POST)
//   OZON_PVZ_API_TOKEN  — токен/ключ авторизации (уходит в заголовок Authorization)
//   OZON_CLIENT_ID      — если API требует Client-Id (как в Seller API)
//
// Пока переменные не заданы (или запрос не удался) — отдаём демо-набор точек,
// чтобы интерфейс выбора работал и его можно было посмотреть. При подключении
// реального API меняется только этот адаптер — интерфейс остаётся прежним.

export type OzonPvzPoint = {
  code: string; // идентификатор пункта (для службы доставки)
  name: string; // короткое название/тип («Пункт выдачи Ozon»)
  address: string; // полный адрес одной строкой
  city: string; // город — для фильтра
  lat: number; // широта (для карты)
  lon: number; // долгота
  worktime?: string; // режим работы, если известен
};

// Небольшой демо-набор реалистичных точек в нескольких городах. Координаты
// приблизительные — только для показа механики выбора на карте.
const SAMPLE_PVZ: OzonPvzPoint[] = [
  // Краснодар
  { code: "KRR-001", name: "Пункт выдачи Ozon", city: "Краснодар", address: "г Краснодар, ул Красная, д 176", lat: 45.052, lon: 38.978, worktime: "Пн–Вс 09:00–21:00" },
  { code: "KRR-002", name: "Пункт выдачи Ozon", city: "Краснодар", address: "г Краснодар, ул Ставропольская, д 86", lat: 45.026, lon: 39.041, worktime: "Пн–Вс 10:00–20:00" },
  { code: "KRR-003", name: "Постамат Ozon", city: "Краснодар", address: "г Краснодар, ул им. Тюляева, д 2", lat: 45.017, lon: 39.083, worktime: "Круглосуточно" },
  { code: "KRR-004", name: "Пункт выдачи Ozon", city: "Краснодар", address: "г Краснодар, ул Дзержинского, д 100", lat: 45.041, lon: 38.938, worktime: "Пн–Вс 09:00–21:00" },
  // Москва
  { code: "MOW-001", name: "Пункт выдачи Ozon", city: "Москва", address: "г Москва, ул Тверская, д 7", lat: 55.760, lon: 37.610, worktime: "Пн–Вс 10:00–22:00" },
  { code: "MOW-002", name: "Пункт выдачи Ozon", city: "Москва", address: "г Москва, Ленинский пр-т, д 54", lat: 55.702, lon: 37.573, worktime: "Пн–Вс 09:00–21:00" },
  { code: "MOW-003", name: "Постамат Ozon", city: "Москва", address: "г Москва, ул Арбат, д 24", lat: 55.749, lon: 37.591, worktime: "Круглосуточно" },
  // Санкт-Петербург
  { code: "SPB-001", name: "Пункт выдачи Ozon", city: "Санкт-Петербург", address: "г Санкт-Петербург, Невский пр-т, д 100", lat: 59.932, lon: 30.360, worktime: "Пн–Вс 10:00–21:00" },
  { code: "SPB-002", name: "Пункт выдачи Ozon", city: "Санкт-Петербург", address: "г Санкт-Петербург, Московский пр-т, д 205", lat: 59.868, lon: 30.320, worktime: "Пн–Вс 09:00–21:00" },
  // Казань
  { code: "KZN-001", name: "Пункт выдачи Ozon", city: "Казань", address: "г Казань, ул Баумана, д 44", lat: 55.792, lon: 49.121, worktime: "Пн–Вс 10:00–20:00" },
  { code: "KZN-002", name: "Постамат Ozon", city: "Казань", address: "г Казань, пр-т Победы, д 91", lat: 55.766, lon: 49.199, worktime: "Круглосуточно" },
];

const norm = (s: string) => s.trim().toLowerCase();

// Фильтр демо-набора по городу и произвольному запросу (адрес/город).
function filterSample(city?: string, q?: string): OzonPvzPoint[] {
  let list = SAMPLE_PVZ;
  if (city && norm(city)) {
    // Берём первое «словарное» слово города (без «г», области и т.п.).
    const c = norm(city).replace(/^г\.?\s*/, "");
    const hit = list.filter((p) => norm(p.city).includes(c) || c.includes(norm(p.city)));
    if (hit.length) list = hit;
  }
  if (q && norm(q)) {
    const needle = norm(q);
    list = list.filter(
      (p) => norm(p.address).includes(needle) || norm(p.city).includes(needle)
    );
  }
  return list;
}

const isConfigured = Boolean(process.env.OZON_PVZ_API_URL);

// Реальный вызов Ozon Rocket. Тело/ответ нормализуем в OzonPvzPoint[].
// Форматы у разных договоров Rocket отличаются — если ответ не распознан или
// запрос упал, спокойно откатываемся на демо-набор (логируем причину).
async function fetchFromOzon(city?: string, q?: string): Promise<OzonPvzPoint[] | null> {
  const url = process.env.OZON_PVZ_API_URL;
  if (!url) return null;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (process.env.OZON_PVZ_API_TOKEN) {
      headers.Authorization = process.env.OZON_PVZ_API_TOKEN;
    }
    if (process.env.OZON_CLIENT_ID) headers["Client-Id"] = process.env.OZON_CLIENT_ID;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ city: city ?? "", query: q ?? "" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[ozon-pvz] Rocket ответил ${res.status}`);
      return null;
    }
    const json = (await res.json()) as unknown;
    return normalizeOzon(json);
  } catch (e) {
    console.error("[ozon-pvz] запрос к Rocket не удался:", e);
    return null;
  }
}

// Приведение произвольного ответа Ozon к нашему типу. Пытаемся достать массив
// точек из типичных обёрток (items/result/points) и распознать поля.
function normalizeOzon(json: unknown): OzonPvzPoint[] | null {
  const root = json as Record<string, unknown>;
  const arr =
    (Array.isArray(json) && json) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.result) && root.result) ||
    (Array.isArray(root?.points) && root.points) ||
    (Array.isArray(root?.pvz) && root.pvz) ||
    null;
  if (!arr) return null;
  const out: OzonPvzPoint[] = [];
  for (const raw of arr as Record<string, unknown>[]) {
    const address = String(raw.address ?? raw.full_address ?? raw.location ?? "").trim();
    const lat = Number(raw.lat ?? raw.latitude ?? (raw.coords as any)?.[1]);
    const lon = Number(raw.lon ?? raw.lng ?? raw.longitude ?? (raw.coords as any)?.[0]);
    if (!address || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      code: String(raw.code ?? raw.id ?? raw.pvz_code ?? address),
      name: String(raw.name ?? raw.type ?? "Пункт выдачи Ozon"),
      address,
      city: String(raw.city ?? "").trim(),
      lat,
      lon,
      worktime: raw.worktime ? String(raw.worktime) : undefined,
    });
  }
  return out.length ? out : null;
}

// Единая точка входа: реальные точки Ozon, иначе демо-набор.
export async function getOzonPvz(
  city?: string,
  q?: string
): Promise<{ points: OzonPvzPoint[]; demo: boolean }> {
  if (isConfigured) {
    const real = await fetchFromOzon(city, q);
    if (real && real.length) return { points: real, demo: false };
  }
  return { points: filterSample(city, q), demo: true };
}
