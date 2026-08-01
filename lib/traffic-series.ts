// Сведение двух источников в один ряд по дням: посещаемость из Яндекс.Метрики
// и заказы из своей базы. Чистые функции без React и без сети — чтобы правила
// (главное из них: как считается конверсия) проверялись тестами, а не глазами
// на живой админке.
//
// Типы описаны здесь структурно, а не импортом из lib/metrika-stats: тот модуль
// помечен server-only, а этими функциями пользуется клиентский компонент графика.

export type TrafficPoint = {
  date: string; // YYYY-MM-DD
  visits: number;
  users: number;
  pageviews?: number;
};

export type OrderPoint = {
  date: string; // ISO-дата оформления
  total: number; // сумма заказа, ₽
};

export type SeriesDay = {
  date: string; // YYYY-MM-DD
  visits: number;
  users: number;
  orders: number;
  revenue: number;
};

export type SeriesTotals = {
  visits: number;
  users: number;
  orders: number;
  revenue: number;
};

// PocketBase отдаёт даты вида "2026-07-14 10:00:00.000Z" — пробел вместо T
// ломает разбор в части браузеров. Приводим к ISO и берём локальный день
// (админ смотрит отчёт в своём часовом поясе).
export function orderDayKey(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// Ряд строим ПО ДНЯМ МЕТРИКИ: именно они — ось графика, и заказ, для которого
// в Метрике дня нет (счётчик поставили позже), в ряд не попадёт. Это честнее,
// чем рисовать день с заказами и нулевой посещаемостью.
export function mergeSeries(
  traffic: TrafficPoint[],
  orders: OrderPoint[]
): SeriesDay[] {
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const key = orderDayKey(o.date);
    if (!key) continue;
    const acc = byDay.get(key) ?? { orders: 0, revenue: 0 };
    acc.orders += 1;
    acc.revenue += o.total;
    byDay.set(key, acc);
  }

  return traffic.map((t) => {
    const acc = byDay.get(t.date);
    return {
      date: t.date,
      visits: t.visits,
      users: t.users,
      orders: acc?.orders ?? 0,
      revenue: acc?.revenue ?? 0,
    };
  });
}

export function totals(days: SeriesDay[]): SeriesTotals {
  return days.reduce<SeriesTotals>(
    (acc, d) => ({
      visits: acc.visits + d.visits,
      users: acc.users + d.users,
      orders: acc.orders + d.orders,
      revenue: acc.revenue + d.revenue,
    }),
    { visits: 0, users: 0, orders: 0, revenue: 0 }
  );
}

// Конверсия: доля визитов, закончившихся заказом, в процентах. Знаменатель —
// именно визиты (а не посетители): так же считает и сама Метрика в отчёте по
// целям, и цифры в двух панелях не будут спорить друг с другом.
// Без визитов конверсии не существует — возвращаем null, а не ноль: «ноль
// процентов» и «считать не из чего» на дашборде выглядят одинаково, но значат
// разное.
export function conversion(orders: number, visits: number): number | null {
  if (visits <= 0) return null;
  return (orders / visits) * 100;
}

// Изменение к прошлому периоду, %. null — сравнивать не с чем (в прошлом
// периоде ноль): рост «с нуля до пяти» не выражается процентом.
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
