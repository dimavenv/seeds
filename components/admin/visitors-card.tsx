import Link from "next/link";
import { plural } from "@/lib/format";
import { conversion, deltaPercent, totals, type SeriesDay } from "@/lib/traffic-series";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

// Плитка «Посетители» на дашборде: сколько людей зашло за неделю, как это
// соотносится с прошлой неделей и сколько из них заказали.
//
// Спарклайн — не диаграмма, а форма числа: у него нет осей и подписей, он
// показывает только форму недели. Разбор по дням, источникам и устройствам
// живёт на отдельной странице — дашборд не должен превращаться в панель
// аналитика.
export default function VisitorsCard({
  days,
  prevVisits,
}: {
  days: SeriesDay[];
  prevVisits: number[];
}) {
  const cur = totals(days);
  const prevSum = prevVisits.reduce((s, v) => s + v, 0);
  const delta = deltaPercent(cur.visits, prevSum);
  const conv = conversion(cur.orders, cur.visits);

  // Спарклайн в единичной сетке 100×30: тянется по ширине карточки, толщина
  // штриха от растяжения не плывёт (non-scaling-stroke).
  const max = Math.max(1, ...days.map((d) => d.visits));
  const n = days.length;
  const point = (v: number, i: number) => {
    const x = n > 1 ? (i * 100) / (n - 1) : 50;
    const y = 30 - (v / max) * 28 - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const line = days.map((d, i) => point(d.visits, i)).join(" ");

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* «За неделю», а не «за 7 дней»: у свежего счётчика дней может быть
              меньше, и подпись с числом врала бы. */}
          <div className="text-sm text-brand-500">Посетителей за неделю</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-extrabold text-brand-800">
              {nf.format(cur.users)}
            </span>
            {delta !== null && (
              <span
                className={`text-sm font-bold ${
                  delta >= 0 ? "text-brand-600" : "text-accent-600"
                }`}
              >
                {delta >= 0 ? "+" : "−"}
                {nf1.format(Math.abs(delta))}%
              </span>
            )}
          </div>
          <div className="text-xs text-brand-400">
            {nf.format(cur.visits)}{" "}
            {plural(cur.visits, ["визит", "визита", "визитов"])}
            {delta !== null && " · к прошлой неделе"}
          </div>
        </div>
      </div>

      {n > 1 && (
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="mt-3 h-10 w-full"
          role="img"
          aria-label={`Визиты по дням за неделю: ${days
            .map((d) => nf.format(d.visits))
            .join(", ")}`}
        >
          <polyline
            points={`0,30 ${line} 100,30`}
            fill="var(--chart-3)"
            fillOpacity={0.1}
            stroke="none"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--chart-3)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-brand-100 pt-3 text-sm">
        <span className="text-brand-600">
          Заказали:{" "}
          <b className="text-brand-800">{nf.format(cur.orders)}</b>
        </span>
        <span className="text-brand-600">
          Конверсия:{" "}
          <b className="text-brand-800">
            {conv === null ? "—" : `${nf1.format(conv)}%`}
          </b>
        </span>
      </div>

      <Link
        href="/admin/analytics"
        className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline"
      >
        Подробная аналитика →
      </Link>
    </div>
  );
}
