import Link from "next/link";
import { createServerPb } from "@/lib/pb/server";
import { mapOrder } from "@/lib/pb/shared";
import { formatPrice } from "@/lib/format";
import { GOALS, GOAL_DESCRIPTIONS, type Goal } from "@/lib/metrika";
import {
  BREAKDOWNS,
  fetchBreakdown,
  fetchGoalStats,
  fetchTraffic,
  type BreakdownRow,
  type MetrikaFailure,
} from "@/lib/metrika-stats";
import {
  conversion,
  deltaPercent,
  mergeSeries,
  totals,
  type OrderPoint,
} from "@/lib/traffic-series";
import TrafficChart from "@/components/admin/traffic-chart";
import StatTile from "@/components/admin/stat-tile";
import BreakdownBars from "@/components/admin/breakdown-bars";
import GoalFunnel from "@/components/admin/goal-funnel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Аналитика" };

// Периоды отчёта. 90 дней — потолок: дальше в дневном разрезе точки сливаются,
// а сезон у семян и так укладывается в квартал.
const PERIODS = [7, 14, 28, 90] as const;
type Period = (typeof PERIODS)[number];

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const fmtDayMonth = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

function parsePeriod(raw?: string): Period {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 14;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

function rangeLabel(days: { date: string }[]): string {
  if (days.length === 0) return "";
  const at = (i: number) => {
    const [y, m, d] = days[i].date.split("-").map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  };
  return `${fmtDayMonth.format(at(0))} – ${fmtDayMonth.format(at(days.length - 1))}`;
}

export default async function AdminAnalytics({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const period = parsePeriod(searchParams.days);

  // Заказы берём за оба периода сразу (текущий + прошлый для сравнения) и
  // считаем ровно так же, как дашборд: отменённые — не продажи.
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (period * 2 - 1));

  const pb = createServerPb();
  const [traffic, goalStats, sources, devices, cities, entryPages, orderRecords] =
    await Promise.all([
      fetchTraffic(period),
      fetchGoalStats(period, Object.values(GOALS)),
      fetchBreakdown("sources", period),
      fetchBreakdown("devices", period, 4),
      fetchBreakdown("cities", period),
      fetchBreakdown("entryPages", period),
      pb
        .collection("orders")
        .getFullList({
          filter: pb.filter(
            '(placed_at >= {:since} || created >= {:since}) && status != "cancelled"',
            { since }
          ),
          sort: "-placed_at",
        })
        .catch(() => [] as never[]),
    ]);

  const orders: OrderPoint[] = orderRecords.map((r) => {
    const o = mapOrder(r);
    return { date: o.created_at, total: o.total };
  });

  if (!traffic.ok) {
    return <NotConnected failure={traffic} period={period} orders={orders} />;
  }

  const days = mergeSeries(traffic.days, orders);
  const prevDays = mergeSeries(traffic.prevDays, orders);
  const cur = totals(days);
  const prev = totals(prevDays);

  const curConv = conversion(cur.orders, cur.visits);
  const prevConv = conversion(prev.orders, prev.visits);

  // Ряды прошлого периода выравниваем по позиции (первый день к первому):
  // так «понедельник против понедельника» сохраняется при любой длине окна.
  const prevVisits = days.map((_, i) => prevDays[i]?.visits ?? 0);

  return (
    <div className="space-y-4">
      <PeriodTabs period={period} />

      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-bold text-brand-800">Итоги периода</h2>
          <span className="text-sm text-brand-500">{rangeLabel(days)}</span>
        </div>

        <div className="mt-4 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            label="Визиты"
            value={nf.format(cur.visits)}
            delta={deltaPercent(cur.visits, prev.visits)}
            hint="заходов на сайт"
          />
          <StatTile
            label="Посетители"
            value={nf.format(cur.users)}
            delta={deltaPercent(cur.users, prev.users)}
            hint="уникальных людей"
          />
          <StatTile
            label="Заказы"
            value={nf.format(cur.orders)}
            delta={deltaPercent(cur.orders, prev.orders)}
            hint="кроме отменённых"
            accent
          />
          <StatTile
            label="Конверсия"
            value={curConv === null ? "—" : `${nf1.format(curConv)}%`}
            delta={
              curConv !== null && prevConv !== null
                ? deltaPercent(curConv, prevConv)
                : null
            }
            hint="визитов с заказом"
            accent
          />
          <StatTile
            label="Выручка"
            value={formatPrice(cur.revenue)}
            delta={deltaPercent(cur.revenue, prev.revenue)}
            hint="по оформленным заказам"
          />
        </div>

        {traffic.quality && (
          <div className="mt-5 grid gap-x-4 gap-y-5 border-t border-brand-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Отказы"
              value={`${nf1.format(traffic.quality.bounceRate)}%`}
              hint="ушли, не посмотрев сайт"
            />
            <StatTile
              label="Глубина просмотра"
              value={nf1.format(traffic.quality.pageDepth)}
              hint="страниц за визит"
            />
            <StatTile
              label="Время на сайте"
              value={fmtDuration(traffic.quality.avgVisitSeconds)}
              hint="в среднем за визит"
            />
            <StatTile
              label="Новые посетители"
              value={`${nf1.format(traffic.quality.newVisitorsPercent)}%`}
              hint="впервые на сайте"
            />
          </div>
        )}

        <p className="mt-4 text-xs text-brand-400">
          Посещаемость — из Яндекс.Метрики (обновляется с задержкой до 10 минут),
          заказы и выручка — из базы магазина. Сравнение — с предыдущими{" "}
          {period} днями: {rangeLabel(prevDays)}.
        </p>
      </div>

      <TrafficChart
        days={days}
        prevVisits={prevVisits}
        periodLabel={`${period} дней · ${rangeLabel(days)}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownBars title={BREAKDOWNS.sources.title} {...breakdown(sources)} />
        <BreakdownBars title={BREAKDOWNS.devices.title} {...breakdown(devices)} />
        <BreakdownBars title={BREAKDOWNS.cities.title} {...breakdown(cities)} />
        <BreakdownBars
          title={BREAKDOWNS.entryPages.title}
          {...breakdown(entryPages)}
        />
      </div>

      {/* Воронка по целям Метрики. Три разных случая, и путать их нельзя:
          цели есть — воронка; целей нет — инструкция, как завести; запрос не
          удался — так и говорим. Раньше сбой запроса показывал инструкцию, и
          выглядело это как «аналитика превратилась в таблицу», хотя цели
          давно заведены. */}
      {!goalStats.ok ? (
        <FetchFailed failure={goalStats} what="Путь покупателя" />
      ) : goalStats.goals.length > 0 ? (
        <>
          <GoalFunnel
            goals={goalStats.goals}
            visits={goalStats.visits || cur.visits}
            periodLabel={`${period} дней · ${rangeLabel(days)}`}
          />
          {/* Осталось завести — только недостающие цели, без уже созданных */}
          <GoalsHelp missing={goalStats.missing} />
        </>
      ) : (
        <GoalsHelp missing={goalStats.missing} />
      )}
    </div>
  );
}

// Срез посещаемости: «данных нет» и «не смогли получить» — разные вещи, и
// подпись в карточке должна их различать.
function breakdown(
  res: { ok: true; rows: BreakdownRow[] } | MetrikaFailure
): { rows: BreakdownRow[]; empty?: string } {
  if (res.ok) return { rows: res.rows };
  return {
    rows: [],
    empty:
      res.reason === "unauthorized"
        ? "Метрика не приняла токен"
        : "Не удалось получить данные — обновите страницу",
  };
}

// Карточка на месте блока, данные для которого получить не удалось.
function FetchFailed({
  failure,
  what,
}: {
  failure: MetrikaFailure;
  what: string;
}) {
  return (
    <div className="card p-5">
      <h2 className="font-bold text-brand-800">{what}</h2>
      <p className="mt-2 text-sm text-brand-600">{failure.message}</p>
      <p className="mt-1 text-sm text-brand-400">
        Это сбой запроса к Метрике, а не потеря настроек: цели и счётчик на
        месте. Обычно помогает обновить страницу.
      </p>
    </div>
  );
}

function PeriodTabs({ period }: { period: Period }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-brand-500">Период:</span>
      {PERIODS.map((p) => (
        <Link
          key={p}
          href={`/admin/analytics?days=${p}`}
          aria-current={p === period ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            p === period
              ? "bg-brand-600 text-white"
              : "border border-brand-200 bg-surface text-brand-600 hover:bg-brand-100"
          }`}
        >
          {p} дней
        </Link>
      ))}
    </div>
  );
}

// Что показать, пока статистика не подключена (или токен перестал работать).
// Заказы из своей базы админ увидит в любом случае — без них страница была бы
// просто пустой.
function NotConnected({
  failure,
  period,
  orders,
}: {
  failure: MetrikaFailure;
  period: Period;
  orders: OrderPoint[];
}) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (period - 1));
  const recent = orders.filter((o) => new Date(o.date.replace(" ", "T")) >= since);
  const revenue = recent.reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-4">
      <PeriodTabs period={period} />

      <div className="card p-5">
        <h2 className="font-bold text-brand-800">
          {failure.reason === "not-configured"
            ? "Посещаемость пока не подключена"
            : "Метрика не отдала статистику"}
        </h2>
        <p className="mt-2 text-sm text-brand-600">{failure.message}</p>

        {failure.reason === "not-configured" && (
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-brand-700">
            <li>
              Создайте счётчик на{" "}
              <a
                href="https://metrika.yandex.ru"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-brand-600 hover:underline"
              >
                metrika.yandex.ru
              </a>{" "}
              и впишите его номер в{" "}
              <code className="rounded bg-brand-100 px-1">
                NEXT_PUBLIC_YANDEX_METRIKA_ID
              </code>
              .
            </li>
            <li>
              Получите OAuth-токен с правом «Получение статистики» и впишите его
              в <code className="rounded bg-brand-100 px-1">YANDEX_METRIKA_TOKEN</code>.
            </li>
            <li>
              Пересоберите сайт (<code className="rounded bg-brand-100 px-1">npm run build</code>)
              и перезапустите его.
            </li>
          </ol>
        )}

        <p className="mt-4 text-sm text-brand-500">
          Пошаговая инструкция — в файле{" "}
          <code className="rounded bg-brand-100 px-1">SETUP-ANALYTICS-RU.md</code>{" "}
          в корне проекта.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-brand-800">Заказы за {period} дней</h2>
        <p className="mt-1 text-sm text-brand-500">
          Эти цифры магазин считает сам, без Метрики.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatTile label="Заказы" value={nf.format(recent.length)} accent />
          <StatTile label="Выручка" value={formatPrice(revenue)} />
        </div>
      </div>

      {/* Список целей уместен, только пока Метрика вообще не подключена. При
          сбое запроса цели давно заведены — показывать инструкцию значит
          пугать зря. */}
      {failure.reason === "not-configured" && <GoalsHelp />}
    </div>
  );
}

// Готовый список целей: их нужно один раз завести в интерфейсе Метрики, иначе
// события с сайта приходят, но отчёта по ним нет. Показывается, только пока ни
// одна цель не заведена — дальше на этом месте живёт воронка с цифрами.
function GoalsHelp({ missing }: { missing?: string[] }) {
  // Метрика ответила и сказала, каких целей не хватает, — показываем только их.
  const goals = (missing ?? (Object.values(GOALS) as string[])) as Goal[];
  if (goals.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-bold text-brand-800">
        {missing ? "Цели, которых ещё нет в Метрике" : "Цели для Яндекс.Метрики"}
      </h2>
      <p className="mt-1 text-sm text-brand-600">
        Сайт уже отправляет эти события, но целей с такими идентификаторами в
        счётчике нет — статистика по ним не собирается. Завести: <b>Метрика →
        Цели → Добавить цель → JavaScript-событие</b>.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-left text-brand-500">
              <th className="py-2 pr-4 font-semibold">Идентификатор цели</th>
              <th className="py-2 font-semibold">Что означает</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {goals.map((goal) => (
              <tr key={goal}>
                <td className="py-2 pr-4 align-top">
                  <code className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-800">
                    {goal}
                  </code>
                </td>
                <td className="py-2 align-top text-brand-700">
                  {GOAL_DESCRIPTIONS[goal]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-400">
        Цель <code className="rounded bg-brand-100 px-1">purchase</code> приходит
        с ценностью заказа в рублях — по ней Метрика считает выручку. Состав
        заказа дополнительно уходит в отчёт «Электронная коммерция».
      </p>
    </div>
  );
}
