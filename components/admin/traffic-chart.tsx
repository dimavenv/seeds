"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, plural } from "@/lib/format";
import { conversion, type SeriesDay } from "@/lib/traffic-series";

// «Посетители и заказы» — две панели с ОБЩЕЙ осью дней и общей крестовиной.
//
// Почему две панели, а не две линии на одном поле: визитов сотни, заказов
// единицы. На одной шкале ряд заказов лёг бы в ноль, а вторая ось справа
// (первый порыв) позволяет подогнать любой вывод — наклон двух рядов зависел бы
// от выбора масштабов, а не от данных. Разрезанные панели сравнивают ЧЕСТНО:
// у каждой своя шкала, а общая ось дат и одна крестовина связывают их в один
// сюжет. Итог сравнения — конверсия — считается числом, а не глазами по
// пересечению линий.

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const fmtDayMonth = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});
const fmtWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

// Даты Метрики — «YYYY-MM-DD». Разбираем по частям: new Date("2026-07-14")
// трактуется как UTC-полночь и в отрицательных поясах отдаёт вчерашний день.
function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 12);
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

function fmtAxis(v: number): string {
  return v >= 1000 ? `${nf1.format(v / 1000)} тыс` : nf.format(v);
}

// Столбик с закруглённой «шапкой» и прямым основанием на нулевой линии.
function barPath(x: number, w: number, top: number, base: number): string {
  const h = base - top;
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  const l = x - w / 2;
  const rt = x + w / 2;
  return [
    `M${l},${base}`,
    `L${l},${top + r}`,
    `Q${l},${top} ${l + r},${top}`,
    `L${rt - r},${top}`,
    `Q${rt},${top} ${rt},${top + r}`,
    `L${rt},${base}`,
    "Z",
  ].join("");
}

export default function TrafficChart({
  days,
  prevVisits,
  periodLabel,
}: {
  days: SeriesDay[];
  // Визиты прошлого периода, выровненные по позициям (день в день) — серия
  // контекста в панели посетителей.
  prevVisits: number[];
  periodLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  // Рисуем в реальных пикселях контейнера, без растягивания вьюпорта: иначе
  // подписи и штрихи поплыли бы вместе с масштабом.
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(300, Math.round(entries[0]?.contentRect.width ?? 640)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;

  // Геометрия: панель посетителей, разрыв, панель заказов, общая ось снизу.
  const padL = 10;
  const padR = 56; // место под подписи шкал справа
  // Подписи панелей стоят НАД полем, а не внутри: внутри они рано или поздно
  // столкнулись бы с линией в удачный день.
  const topA = 26;
  const hA = 132;
  const baseA = topA + hA;
  const topB = baseA + 30;
  const hB = 72;
  const baseB = topB + hB;
  const H = baseB + 34;
  const innerW = Math.max(1, w - padL - padR);

  const visits = useMemo(() => days.map((d) => d.visits), [days]);
  const orders = useMemo(() => days.map((d) => d.orders), [days]);

  const maxA = niceCeil(Math.max(1, ...visits, ...prevVisits));
  const maxB = niceCeil(Math.max(1, ...orders));

  // Полосовая раскладка: центр дня один и тот же в обеих панелях, поэтому
  // крестовина, точка на линии и столбик всегда стоят на одной вертикали.
  const band = innerW / Math.max(1, n);
  const x = (i: number) => padL + band * (i + 0.5);
  const yA = (v: number) => topA + hA * (1 - v / maxA);
  const yB = (v: number) => topB + hB * (1 - v / maxB);
  const barW = Math.min(24, Math.max(3, band - 2)); // 2px «воздуха» между столбиками

  const linePath = (vals: number[], y: (v: number) => number) =>
    vals
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
  const areaPath = (vals: number[]) =>
    vals.length === 0
      ? ""
      : `${linePath(vals, yA)}L${x(n - 1).toFixed(1)},${baseA}L${x(0).toFixed(
          1
        )},${baseA}Z`;

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = e.clientX - rect.left - padL;
    setActive(Math.max(0, Math.min(n - 1, Math.floor(px / band))));
  };

  // Подписи оси прореживаем и по длине периода, и по РЕАЛЬНОЙ ширине полосы:
  // те же 14 дней на телефоне занимают вдвое меньше места, и числа слиплись бы.
  const minTickPx = 26;
  const tickStep = Math.max(
    n <= 14 ? 1 : n <= 31 ? 2 : 7,
    Math.ceil(minTickPx / Math.max(1, band))
  );
  const showTick = (i: number) => (n - 1 - i) % tickStep === 0;

  const day = active !== null ? days[active] : null;
  const dayConv = day ? conversion(day.orders, day.visits) : null;

  const tipW = 208;
  const tipLeft =
    active === null ? 0 : Math.max(4, Math.min(w - tipW - 4, x(active) - tipW / 2));

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-bold text-brand-800">Посетители и заказы</h2>
        <span className="text-sm text-brand-500">{periodLabel}</span>
      </div>

      <div
        ref={boxRef}
        className="relative mt-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            setActive((i) => Math.min(n - 1, (i ?? n - 1) + 1));
            e.preventDefault();
          } else if (e.key === "ArrowLeft") {
            setActive((i) => Math.max(0, (i ?? n - 1) - 1));
            e.preventDefault();
          } else if (e.key === "Escape") {
            setActive(null);
          }
        }}
        onBlur={() => setActive(null)}
      >
        <svg
          ref={svgRef}
          width={w}
          height={H}
          role="img"
          aria-label={`Посетители и заказы по дням, ${periodLabel}. Значения продублированы таблицей ниже.`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        >
          {/* ── Панель 1: посетители ─────────────────────────────────── */}
          <text
            x={padL}
            y={topA - 10}
            fontSize={11}
            fontWeight={600}
            fill="rgb(var(--brand-500))"
          >
            Визиты
          </text>
          {[maxA, maxA / 2].map((v) => (
            <g key={`a-${v}`}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={yA(v)}
                y2={yA(v)}
                stroke="rgb(var(--brand-100))"
                strokeWidth={1}
              />
              <text
                x={w - padR + 8}
                y={yA(v) + 4}
                fontSize={11}
                fill="rgb(var(--brand-400))"
              >
                {fmtAxis(v)}
              </text>
            </g>
          ))}
          <line
            x1={padL}
            x2={padL + innerW}
            y1={baseA}
            y2={baseA}
            stroke="rgb(var(--brand-200))"
            strokeWidth={1}
          />

          {/* Прошлый период — серия-контекст, приглушённая и без заливки */}
          {prevVisits.length > 0 && (
            <path
              d={linePath(prevVisits, yA)}
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          <path d={areaPath(visits)} fill="var(--chart-3)" fillOpacity={0.1} />
          <path
            d={linePath(visits, yA)}
            fill="none"
            stroke="var(--chart-3)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* ── Панель 2: заказы ─────────────────────────────────────── */}
          <text
            x={padL}
            y={topB - 8}
            fontSize={11}
            fontWeight={600}
            fill="rgb(var(--brand-500))"
          >
            Заказы
          </text>
          <text
            x={w - padR + 8}
            y={yB(maxB) + 4}
            fontSize={11}
            fill="rgb(var(--brand-400))"
          >
            {fmtAxis(maxB)}
          </text>
          <line
            x1={padL}
            x2={padL + innerW}
            y1={baseB}
            y2={baseB}
            stroke="rgb(var(--brand-200))"
            strokeWidth={1}
          />
          {orders.map((v, i) =>
            v > 0 ? (
              <path
                key={`bar-${i}`}
                d={barPath(x(i), barW, yB(v), baseB)}
                fill="var(--chart-1)"
                fillOpacity={active === null || active === i ? 1 : 0.65}
              />
            ) : null
          )}

          {/* Крестовина через обе панели — она и связывает их в один день */}
          {active !== null && (
            <>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={topA}
                y2={baseB}
                stroke="rgb(var(--brand-300))"
                strokeWidth={1}
              />
              {/* Точка ≥8px с кольцом цвета подложки — читается и на линии, и
                  поверх заливки */}
              <circle
                cx={x(active)}
                cy={yA(visits[active] ?? 0)}
                r={5}
                fill="var(--chart-3)"
                stroke="rgb(var(--surface))"
                strokeWidth={2}
              />
            </>
          )}

          {/* ── Общая ось дней ───────────────────────────────────────── */}
          {days.map((d, i) => {
            if (!showTick(i)) return null;
            const date = parseDay(d.date);
            const dow = date.getDay();
            const weekend = dow === 0 || dow === 6;
            return (
              <g key={`tick-${d.date}`}>
                <text
                  x={x(i)}
                  y={baseB + 15}
                  fontSize={11}
                  textAnchor="middle"
                  fill="rgb(var(--brand-400))"
                >
                  {String(date.getDate()).padStart(2, "0")}
                </text>
                {weekend && (
                  <text
                    x={x(i)}
                    y={baseB + 28}
                    fontSize={10}
                    textAnchor="middle"
                    fill="rgb(var(--brand-300))"
                  >
                    {fmtWeekday.format(date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {n === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-brand-400">
            Метрика ещё не собрала данные за этот период
          </div>
        )}

        {day && (
          <div
            className="pointer-events-none absolute top-1 z-10 card p-3 shadow-lg"
            style={{ left: tipLeft, width: tipW }}
          >
            <div className="text-xs font-semibold text-brand-500">
              {fmtDayMonth.format(parseDay(day.date))},{" "}
              {fmtWeekday.format(parseDay(day.date))}
            </div>
            <TipRow
              color="var(--chart-3)"
              value={nf.format(day.visits)}
              label={plural(day.visits, ["визит", "визита", "визитов"])}
            />
            <TipRow
              color="var(--chart-2)"
              value={nf.format(prevVisits[active!] ?? 0)}
              label="прошлый период"
            />
            {/* Заказы — столбики, поэтому и метка в подсказке квадратная: форма
                маркера повторяет форму метки на графике. */}
            <TipRow
              color="var(--chart-1)"
              value={nf.format(day.orders)}
              label={plural(day.orders, ["заказ", "заказа", "заказов"])}
              square
            />
            <div className="mt-1.5 border-t border-brand-100 pt-1.5 text-xs text-brand-500">
              Конверсия:{" "}
              <span className="font-bold tabular-nums text-brand-800">
                {dayConv === null ? "—" : `${nf1.format(dayConv)}%`}
              </span>
              {day.revenue > 0 && <> · {formatPrice(day.revenue)}</>}
            </div>
          </div>
        )}
      </div>

      {/* Легенда: в верхней панели две серии, поэтому опознавание не должно
          держаться на одном цвете */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-brand-600">
        <LegendItem color="var(--chart-3)">Визиты</LegendItem>
        <LegendItem color="var(--chart-2)">Прошлый период</LegendItem>
        <LegendItem color="var(--chart-1)" square>
          Заказы
        </LegendItem>
      </div>

      {/* Те же данные таблицей — для скринридеров и для тех, кому цвет не
          помогает вовсе */}
      <table className="sr-only">
        <caption>Посетители и заказы по дням</caption>
        <thead>
          <tr>
            <th>День</th>
            <th>Визиты</th>
            <th>Посетители</th>
            <th>Заказы</th>
            <th>Конверсия</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const c = conversion(d.orders, d.visits);
            return (
              <tr key={d.date}>
                <td>{fmtDayMonth.format(parseDay(d.date))}</td>
                <td>{nf.format(d.visits)}</td>
                <td>{nf.format(d.users)}</td>
                <td>{nf.format(d.orders)}</td>
                <td>{c === null ? "—" : `${nf1.format(c)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TipRow({
  color,
  value,
  label,
  square,
}: {
  color: string;
  value: string;
  label: string;
  square?: boolean;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      {/* Обёртка фиксированной ширины: линия и квадрат занимают одинаковое
          место, и числа в подсказке стоят одной колонкой. */}
      <span className="flex w-3.5 shrink-0 justify-center">
        <span
          className={square ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-full rounded-full"}
          style={{ background: color }}
        />
      </span>
      <span className="text-sm font-bold tabular-nums text-brand-800">{value}</span>
      <span className="min-w-0 truncate text-xs text-brand-500">{label}</span>
    </div>
  );
}

function LegendItem({
  color,
  square,
  children,
}: {
  color: string;
  square?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={square ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-4 rounded-full"}
        style={{ background: color }}
      />
      {children}
    </span>
  );
}
