import "server-only";

// Чтение статистики Яндекс.Метрики (Stat API v1) для админки.
//
// Счётчик на сайте только СОБИРАЕТ данные; чтобы показать их в своей админке,
// нужен отдельный ключ — OAuth-токен с правом metrika:read. Он серверный и
// секретный (в отличие от номера счётчика NEXT_PUBLIC_YANDEX_METRIKA_ID,
// который по определению виден в HTML). Как его получить — SETUP-ANALYTICS-RU.md.
//
// Ошибки НЕ бросаем: админка должна открываться, даже когда API Метрики лежит
// или токен протух. Вместо исключения возвращаем разобранную причину, и
// страница показывает понятную плашку вместо графика.

const STAT_API = "https://api-metrika.yandex.net/stat/v1/data";

// Ответ Метрики кэшируем на 10 минут: данные всё равно обновляются с
// задержкой, а лимит API — 5000 запросов в сутки на счётчик. Без кэша каждое
// обновление админки било бы по нему четырьмя запросами.
const REVALIDATE_SECONDS = 600;
const TIMEOUT_MS = 10000;

export type MetrikaFailure = {
  ok: false;
  // not-configured — не заданы переменные (обычное состояние до настройки);
  // unauthorized — токен не подошёл или у аккаунта нет доступа к счётчику;
  // unavailable — сеть, таймаут, 5xx, неожиданный формат ответа.
  reason: "not-configured" | "unauthorized" | "unavailable";
  message: string;
};

export type MetrikaResult<T> = ({ ok: true } & T) | MetrikaFailure;

export type TrafficDay = {
  date: string; // YYYY-MM-DD
  visits: number; // визиты (сессии)
  users: number; // посетители (уникальные)
  pageviews: number; // просмотры страниц
};

export type TrafficQuality = {
  bounceRate: number; // отказы, %
  avgVisitSeconds: number; // среднее время на сайте
  pageDepth: number; // страниц за визит
  newVisitorsPercent: number; // доля новых посетителей, %
};

export type TrafficStats = {
  days: TrafficDay[]; // выбранный период, по дням
  prevDays: TrafficDay[]; // столько же дней перед ним — для сравнения
  quality: TrafficQuality | null;
};

export type BreakdownRow = { name: string; visits: number };

// Срезы, которые показываем в админке. Ключ — то, что пишет админ, значение —
// измерение Метрики.
export const BREAKDOWNS = {
  sources: { dimension: "ym:s:lastTrafficSource", title: "Источники трафика" },
  devices: { dimension: "ym:s:deviceCategory", title: "Устройства" },
  cities: { dimension: "ym:s:regionCity", title: "Города" },
  entryPages: { dimension: "ym:s:startURLPath", title: "Страницы входа" },
} as const;

export type BreakdownKey = keyof typeof BREAKDOWNS;

// --- Настройки --------------------------------------------------------------

// Номер счётчика для API берём из отдельной переменной, но по умолчанию — тот
// же, что стоит на сайте: держать два разных номера незачем, а забыть второй
// легко.
function counterId(): string {
  return (
    process.env.YANDEX_METRIKA_COUNTER_ID?.trim() ||
    process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim() ||
    ""
  );
}

function token(): string {
  return process.env.YANDEX_METRIKA_TOKEN?.trim() || "";
}

export function metrikaStatsConfigured(): boolean {
  return Boolean(counterId() && token());
}

const NOT_CONFIGURED: MetrikaFailure = {
  ok: false,
  reason: "not-configured",
  message:
    "Статистика Метрики не подключена: нужны YANDEX_METRIKA_TOKEN и номер счётчика.",
};

// --- Даты -------------------------------------------------------------------

// Метрика считает сутки по часовому поясу счётчика; сервер живёт по своему.
// Поэтому дату собираем из локальных полей (а не toISOString, который увёл бы
// вечерние визиты на следующий день при UTC-сервере).
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

// --- Запрос -----------------------------------------------------------------

async function request(
  path: "" | "/bytime",
  params: Record<string, string | number>
): Promise<MetrikaResult<{ json: unknown }>> {
  const id = counterId();
  const oauth = token();
  if (!id || !oauth) return NOT_CONFIGURED;

  const url = new URL(STAT_API + path);
  url.searchParams.set("ids", id);
  url.searchParams.set("lang", "ru");
  // full — точные данные без сэмплирования: у магазина семян объёмы такие, что
  // выборка только исказила бы картину.
  url.searchParams.set("accuracy", "full");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${oauth}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: "unauthorized",
        message:
          "Метрика не приняла токен: он истёк или у аккаунта нет доступа к счётчику.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: "unavailable",
        message: `Метрика ответила ошибкой ${res.status}.`,
      };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    console.error("[metrika] запрос к Stat API не прошёл:", e);
    return {
      ok: false,
      reason: "unavailable",
      message: "Метрика не отвечает — попробуйте обновить страницу позже.",
    };
  }
}

// --- Разбор ответов ---------------------------------------------------------

// Ответы Метрики разбираем отдельными чистыми функциями: формат вложенный
// (в bytime totals — массив «метрика → значения по дням»), и ошибиться в
// порядке индексов проще всего именно здесь. Тесты в tests/metrika.test.ts
// работают с этими функциями напрямую, без сети.

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// bytime: totals[i] — ряд i-й метрики по интервалам, time_intervals[j] — даты.
export function parseByTime(json: unknown): TrafficDay[] {
  const body = json as {
    totals?: unknown[];
    time_intervals?: unknown[];
  } | null;
  const intervals = Array.isArray(body?.time_intervals) ? body!.time_intervals : [];
  const totals = Array.isArray(body?.totals) ? body!.totals : [];
  const row = (i: number): unknown[] =>
    Array.isArray(totals[i]) ? (totals[i] as unknown[]) : [];
  const visits = row(0);
  const users = row(1);
  const pageviews = row(2);

  return intervals.map((interval, i) => ({
    // time_intervals — пары [начало, конец]; при group=day они совпадают.
    date: Array.isArray(interval) ? String(interval[0] ?? "") : String(interval),
    visits: num(visits[i]),
    users: num(users[i]),
    pageviews: num(pageviews[i]),
  }));
}

export function parseQuality(json: unknown): TrafficQuality | null {
  const totals = (json as { totals?: unknown } | null)?.totals;
  if (!Array.isArray(totals) || totals.length < 4) return null;
  return {
    bounceRate: num(totals[0]),
    avgVisitSeconds: num(totals[1]),
    pageDepth: num(totals[2]),
    newVisitorsPercent: num(totals[3]),
  };
}

export function parseBreakdown(json: unknown): BreakdownRow[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const r = row as { dimensions?: unknown[]; metrics?: unknown[] };
      const dim = Array.isArray(r.dimensions) ? r.dimensions[0] : null;
      const name =
        (dim as { name?: unknown } | null)?.name ??
        (dim as { id?: unknown } | null)?.id ??
        "Не определено";
      return {
        // Пустое имя Метрика отдаёт для «не определено» — показываем словом,
        // иначе в таблице получаются пустые строки без объяснения.
        name: String(name || "Не определено"),
        visits: num(Array.isArray(r.metrics) ? r.metrics[0] : 0),
      };
    })
    .filter((r) => r.visits > 0);
}

// --- Публичные запросы ------------------------------------------------------

// Посещаемость по дням за period дней + столько же дней перед ним (одним
// запросом: сравнение периодов — это тот же ряд, разрезанный пополам) и
// качественные метрики за текущий период.
export async function fetchTraffic(
  period: number
): Promise<MetrikaResult<TrafficStats>> {
  if (!metrikaStatsConfigured()) return NOT_CONFIGURED;

  const date2 = isoDate(daysAgo(0));
  const date1 = isoDate(daysAgo(period * 2 - 1));
  const qualityFrom = isoDate(daysAgo(period - 1));

  const [byTime, quality] = await Promise.all([
    request("/bytime", {
      metrics: "ym:s:visits,ym:s:users,ym:s:pageviews",
      date1,
      date2,
      group: "day",
      limit: 1,
    }),
    request("", {
      metrics:
        "ym:s:bounceRate,ym:s:avgVisitDurationSeconds,ym:s:pageDepth,ym:s:percentNewVisitors",
      date1: qualityFrom,
      date2,
      limit: 1,
    }),
  ]);

  if (!byTime.ok) return byTime;

  const all = parseByTime(byTime.json);
  // Ряд короче ожидаемого (счётчик создан на днях) — недостающие дни просто
  // отсутствуют; берём последние period дней как текущий период.
  const days = all.slice(-period);
  const prevDays = all.slice(0, Math.max(0, all.length - period)).slice(-period);

  return {
    ok: true,
    days,
    prevDays,
    quality: quality.ok ? parseQuality(quality.json) : null,
  };
}

// Один срез (источники / устройства / города / страницы входа) за period дней.
export async function fetchBreakdown(
  key: BreakdownKey,
  period: number,
  limit = 7
): Promise<MetrikaResult<{ rows: BreakdownRow[] }>> {
  if (!metrikaStatsConfigured()) return NOT_CONFIGURED;

  const res = await request("", {
    metrics: "ym:s:visits",
    dimensions: BREAKDOWNS[key].dimension,
    date1: isoDate(daysAgo(period - 1)),
    date2: isoDate(daysAgo(0)),
    sort: "-ym:s:visits",
    limit,
  });
  if (!res.ok) return res;
  return { ok: true, rows: parseBreakdown(res.json) };
}
