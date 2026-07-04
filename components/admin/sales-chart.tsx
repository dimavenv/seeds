"use client";

import { useMemo, useState } from "react";

// Дневная точка статистики (заполняется на сервере в app/admin/page.tsx).
export type SalesDay = {
  date: string; // YYYY-MM-DD
  orderedRub: number;
  orderedQty: number;
  deliveredRub: number;
  deliveredQty: number;
};

export type TopCategory = { name: string; share: number } | null;

type Period = 7 | 14 | 28;
type Unit = "rub" | "qty";
type Compare = "delivered" | "prev";

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dayMonth(iso: string): string {
  const dt = parseDay(iso);
  return `${dt.getDate()} ${MONTHS_GEN[dt.getMonth()]}`;
}
function rangeLabel(days: SalesDay[]): string {
  if (days.length === 0) return "";
  return `${dayMonth(days[0].date)} – ${dayMonth(days[days.length - 1].date)}`;
}
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

// «Красивый» потолок оси Y, чтобы деления были круглыми.
function niceMax(v: number): number {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

function tickLabel(v: number, unit: Unit): string {
  const num = v >= 1000 ? `${nf1.format(v / 1000)} тыс` : nf.format(v);
  return unit === "rub" ? num : `${num} шт`;
}

function pointLabel(rub: number, qty: number): string {
  return `${nf.format(rub)} ₽ · ${nf.format(qty)} шт`;
}

// Геометрия SVG (масштабируется через viewBox).
const W = 720;
const H = 240;
const PAD_L = 12;
const PAD_R = 66;
const PAD_T = 16;
const PAD_B = 34;

export default function SalesChart({
  days,
  topCategory,
}: {
  days: SalesDay[]; // 56 дней, от старых к новым
  topCategory: TopCategory;
}) {
  const [period, setPeriod] = useState<Period>(14);
  const [unit, setUnit] = useState<Unit>("rub");
  const [compare, setCompare] = useState<Compare>("delivered");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const current = useMemo(() => days.slice(-period), [days, period]);
  const previous = useMemo(
    () => days.slice(days.length - period * 2, days.length - period),
    [days, period]
  );

  const orderedVals = current.map((d) => (unit === "rub" ? d.orderedRub : d.orderedQty));
  const compareVals =
    compare === "delivered"
      ? current.map((d) => (unit === "rub" ? d.deliveredRub : d.deliveredQty))
      : previous.map((d) => (unit === "rub" ? d.orderedRub : d.orderedQty));

  const max = niceMax(Math.max(...orderedVals, ...compareVals, 0));
  const n = current.length;
  const x = (i: number) => PAD_L + (i / Math.max(n - 1, 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const baseline = y(0);

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) =>
    `${linePath(vals)} L${x(vals.length - 1).toFixed(1)} ${baseline} L${x(0).toFixed(1)} ${baseline} Z`;

  // Итоги за период и дельта к прошлому периоду (всегда в рублях, как у Ozon).
  const totalRub = current.reduce((s, d) => s + d.orderedRub, 0);
  const totalQty = current.reduce((s, d) => s + d.orderedQty, 0);
  const prevRub = previous.reduce((s, d) => s + d.orderedRub, 0);
  const delta = prevRub > 0 ? ((totalRub - prevRub) / prevRub) * 100 : null;

  const compareLabel = compare === "delivered" ? "Доставлено" : "Прошлый период";
  const compareRange = compare === "delivered" ? rangeLabel(current) : rangeLabel(previous);

  // Подписи оси X: при 28 днях — через одну, выходные помечаем «сб»/«вс».
  const showXLabel = (i: number) => n <= 14 || i % 2 === 0 || i === n - 1;

  const hoverDay = hover !== null ? current[hover] : null;
  const hoverPrev = hover !== null ? previous[hover] : null;

  return (
    <div className="card flex h-full flex-col p-5">
      {/* Шапка: заголовок + настройки */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-brand-800">Заказано товаров</h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
          >
            В {unit === "rub" ? "рублях" : "штуках"} за {period} дней
            <svg
              viewBox="0 0 20 20"
              className={`h-4 w-4 transition ${menuOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-brand-100 bg-surface p-2 shadow-lg motion-safe:animate-pop-in">
                <MenuGroup label="Сравнение заказов">
                  <MenuItem active={compare === "delivered"} onClick={() => setCompare("delivered")}>
                    С доставленными
                  </MenuItem>
                  <MenuItem active={compare === "prev"} onClick={() => setCompare("prev")}>
                    С прошлым периодом
                  </MenuItem>
                </MenuGroup>
                <MenuGroup label="Единица измерения">
                  <MenuItem active={unit === "rub"} onClick={() => setUnit("rub")}>
                    Рубли
                  </MenuItem>
                  <MenuItem active={unit === "qty"} onClick={() => setUnit("qty")}>
                    Штуки
                  </MenuItem>
                </MenuGroup>
                <MenuGroup label="Период">
                  {([7, 14, 28] as Period[]).map((p) => (
                    <MenuItem key={p} active={period === p} onClick={() => setPeriod(p)}>
                      {p} дней
                    </MenuItem>
                  ))}
                </MenuGroup>
              </div>
            </>
          )}
        </div>
      </div>

      {/* График */}
      <div className="relative mt-3" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="График заказов по дням">
          {/* Сетка */}
          {[max / 2, max].map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R + 8} y1={y(v)} y2={y(v)} className="stroke-brand-100" strokeWidth="1" />
              <text x={W - PAD_R + 12} y={y(v) + 4} className="fill-brand-400 text-[12px]">
                {tickLabel(v, unit)}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={W - PAD_R + 8} y1={baseline} y2={baseline} className="stroke-brand-200" strokeWidth="1" />

          {/* Сравнение: мягкая заливка + линия */}
          <path d={areaPath(compareVals)} fill="var(--chart-compare)" opacity="0.1" />
          <path
            d={linePath(compareVals)}
            fill="none"
            stroke="var(--chart-compare)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Курсор наведения */}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={baseline} className="stroke-brand-200" strokeWidth="1" />
          )}

          {/* Заказано: основная линия с точками */}
          <path
            d={linePath(orderedVals)}
            fill="none"
            stroke="var(--chart-ordered)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {orderedVals.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={hover === i ? 5 : 4}
              fill="var(--chart-ordered)"
              stroke="rgb(var(--surface))"
              strokeWidth="2"
            />
          ))}

          {/* Ось X: число + день недели для выходных */}
          {current.map((d, i) => {
            if (!showXLabel(i)) return null;
            const wd = parseDay(d.date).getDay();
            const weekend = wd === 0 || wd === 6;
            return (
              <g key={d.date}>
                <text x={x(i)} y={H - 16} textAnchor="middle" className="fill-brand-500 text-[12px]">
                  {parseDay(d.date).getDate()}
                </text>
                {(weekend || i === 0) && (
                  <text x={x(i)} y={H - 2} textAnchor="middle" className="fill-brand-400 text-[11px]">
                    {WEEKDAYS[wd]}
                  </text>
                )}
              </g>
            );
          })}

          {/* Невидимые зоны наведения (шире точек) */}
          {current.map((_, i) => {
            const half = (W - PAD_L - PAD_R) / Math.max(n - 1, 1) / 2;
            return (
              <rect
                key={i}
                x={x(i) - half}
                y={0}
                width={half * 2}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            );
          })}
        </svg>

        {/* Тултип */}
        {hoverDay && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-brand-100 bg-surface px-3 py-2 text-sm shadow-md"
            style={{ left: `${Math.min(Math.max((x(hover!) / W) * 100, 16), 84)}%` }}
          >
            <div className="whitespace-nowrap font-semibold text-brand-800">
              {dayMonth(hoverDay.date)}, {WEEKDAYS[parseDay(hoverDay.date).getDay()]}
            </div>
            <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-brand-700">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--chart-ordered)" }} />
              Заказано: {pointLabel(hoverDay.orderedRub, hoverDay.orderedQty)}
            </div>
            <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-brand-700">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--chart-compare)" }} />
              {compare === "delivered"
                ? `Доставлено: ${pointLabel(hoverDay.deliveredRub, hoverDay.deliveredQty)}`
                : hoverPrev
                  ? `${dayMonth(hoverPrev.date)}: ${pointLabel(hoverPrev.orderedRub, hoverPrev.orderedQty)}`
                  : "—"}
            </div>
          </div>
        )}
      </div>

      {/* Легенда */}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-brand-600">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: "var(--chart-ordered)" }} />
          Заказано: {rangeLabel(current)}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: "var(--chart-compare)" }} />
          {compareLabel}: {compareRange}
        </span>
      </div>

      {/* Итоги за период */}
      <div className="mt-4 grid gap-4 border-t border-brand-100 pt-4 sm:grid-cols-2 sm:divide-x sm:divide-brand-100">
        <div>
          <div className="text-sm text-brand-500">Заказано за {rangeLabel(current)}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-extrabold text-brand-800">{nf.format(totalRub)} ₽</span>
            {delta !== null && (
              <span
                className={`text-sm font-bold ${
                  delta < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {nf1.format(delta)}%
              </span>
            )}
            <span className="text-sm text-brand-600">, {nf.format(totalQty)} шт</span>
          </div>
        </div>
        <div className="sm:pl-4">
          <div className="text-sm text-brand-500">Ваша ТОП-категория</div>
          {topCategory ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-extrabold text-brand-800">{topCategory.name}</span>
              <span className="text-sm text-brand-600">
                {nf.format(topCategory.share)}% выручки за 28 дней
              </span>
            </div>
          ) : (
            <div className="mt-1 text-2xl font-extrabold text-brand-800">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-brand-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-brand-50 ${
        active ? "font-semibold text-brand-800" : "text-brand-600"
      }`}
    >
      {children}
      {active && (
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
