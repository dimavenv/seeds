"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

// Компактные данные заказа для графика (сервер отдаёт только последние ~8 недель).
export type SalesOrderPoint = {
  date: string; // дата оформления (ISO)
  total: number; // стоимость товаров, ₽
  qty: number; // штук товаров
  done: boolean; // заказ выполнен — серия «доставлено»
  items: { name: string; qty: number; sum: number }[];
};

type Unit = "rub" | "qty";
type Compare = "delivered" | "prev";
const PERIODS = [7, 14, 28] as const;
type Period = (typeof PERIODS)[number];

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const fmtDayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const fmtWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// PocketBase отдаёт даты вида "2026-07-14 10:00:00.000Z" — пробел ломает
// парсинг в части браузеров, приводим к ISO.
function parseDate(s: string): Date {
  return new Date(s.includes("T") ? s : s.replace(" ", "T"));
}

// «Круглый» максимум оси Y, чтобы деления читались (7 200, а не 7 143).
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

function rangeLabel(from: Date, to: Date): string {
  return `${fmtDayMonth.format(from)} – ${fmtDayMonth.format(to)}`;
}

export default function SalesChart({ orders }: { orders: SalesOrderPoint[] }) {
  const [period, setPeriod] = useState<Period>(14);
  const [unit, setUnit] = useState<Unit>("rub");
  const [compare, setCompare] = useState<Compare>("delivered");
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  // Ширина под контейнер — SVG рисуется в реальных пикселях, без растяжения.
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 640;
      setW(Math.max(300, Math.round(width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const data = useMemo(() => {
    // Дни текущего периода (по локальному времени администратора) и прошлого.
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days: Date[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const prevDays = days.map((d) => {
      const p = new Date(d);
      p.setDate(p.getDate() - period);
      return p;
    });

    type DayAgg = { rub: number; qty: number; doneRub: number; doneQty: number };
    const agg = new Map<string, DayAgg>();
    const bump = (key: string, o: SalesOrderPoint) => {
      const a = agg.get(key) ?? { rub: 0, qty: 0, doneRub: 0, doneQty: 0 };
      a.rub += o.total;
      a.qty += o.qty;
      if (o.done) {
        a.doneRub += o.total;
        a.doneQty += o.qty;
      }
      agg.set(key, a);
    };
    for (const o of orders) bump(dayKey(parseDate(o.date)), o);

    const val = (a: DayAgg | undefined, kind: "all" | "done"): number => {
      if (!a) return 0;
      if (unit === "rub") return kind === "all" ? a.rub : a.doneRub;
      return kind === "all" ? a.qty : a.doneQty;
    };
    const ordered = days.map((d) => val(agg.get(dayKey(d)), "all"));
    const delivered = days.map((d) => val(agg.get(dayKey(d)), "done"));
    const previous = prevDays.map((d) => val(agg.get(dayKey(d)), "all"));

    // Итоги периода и дельта к прошлому — в выбранной единице измерения.
    const curSet = new Set(days.map(dayKey));
    const prevSet = new Set(prevDays.map(dayKey));
    let curRub = 0;
    let curQty = 0;
    let curOrders = 0;
    let prevVal = 0;
    const top = new Map<string, { qty: number; sum: number }>();
    for (const o of orders) {
      const key = dayKey(parseDate(o.date));
      if (curSet.has(key)) {
        curRub += o.total;
        curQty += o.qty;
        curOrders += 1;
        for (const it of o.items) {
          const t = top.get(it.name) ?? { qty: 0, sum: 0 };
          t.qty += it.qty;
          t.sum += it.sum;
          top.set(it.name, t);
        }
      }
      if (prevSet.has(key)) prevVal += unit === "rub" ? o.total : o.qty;
    }
    const curVal = unit === "rub" ? curRub : curQty;
    const delta = prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : null;
    let topProduct: { name: string; qty: number; sum: number } | null = null;
    for (const [name, t] of top) {
      if (!topProduct || t.sum > topProduct.sum) topProduct = { name, ...t };
    }

    return { days, prevDays, ordered, delivered, previous, curRub, curQty, curOrders, delta, topProduct };
  }, [orders, period, unit]);

  const { days, prevDays, ordered, delivered, previous } = data;
  const cmp = compare === "delivered" ? delivered : previous;
  const n = days.length;

  // Геометрия графика.
  const H = 250;
  const padT = 14;
  const padB = 34;
  const padL = 10;
  const padR = 56;
  const innerW = w - padL - padR;
  const innerH = H - padT - padB;
  const y0 = padT + innerH;
  const yMax = niceCeil(Math.max(...ordered, ...cmp));
  const x = (i: number) => padL + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);
  const y = (v: number) => padT + innerH * (1 - v / yMax);

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const areaPath = (vals: number[]) =>
    `${linePath(vals)}L${x(n - 1).toFixed(1)},${y0}L${x(0).toFixed(1)},${y0}Z`;

  const fmtVal = (v: number) => (unit === "rub" ? formatPrice(v) : `${nf.format(v)} шт`);
  const fmtAxis = (v: number) =>
    v >= 1000 ? `${nf1.format(v / 1000)} тыс` : nf.format(v);

  // На 28 днях подписываем каждый второй день, чтобы не слипались.
  const showTick = (i: number) => n <= 14 || (n - 1 - i) % 2 === 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left - padL;
    const step = n > 1 ? innerW / (n - 1) : innerW;
    setActive(Math.max(0, Math.min(n - 1, Math.round(px / step))));
  };

  const hasOrders = orders.length > 0;
  const cmpLabel =
    compare === "delivered"
      ? `Доставлено: ${rangeLabel(days[0], days[n - 1])}`
      : `Прошлый период: ${rangeLabel(prevDays[0], prevDays[n - 1])}`;
  const cmpRowLabel = compare === "delivered" ? "доставлено" : "прошлый период";

  // Тултип не должен вылезать за карточку.
  const tipW = 190;
  const tipLeft =
    active === null ? 0 : Math.max(4, Math.min(w - tipW - 4, x(active) - tipW / 2));

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-brand-800">Заказано товаров</h2>

        {/* Выпадающие настройки: сравнение, единица, период */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-surface px-3.5 py-1.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-100"
          >
            {unit === "rub" ? "В рублях" : "В штуках"} за {period} дней
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-64 card p-2 shadow-xl">
              <MenuSection title="Сравнение заказов">
                <MenuOption
                  selected={compare === "delivered"}
                  onClick={() => setCompare("delivered")}
                >
                  С доставленными
                </MenuOption>
                <MenuOption
                  selected={compare === "prev"}
                  onClick={() => setCompare("prev")}
                >
                  С прошлым периодом
                </MenuOption>
              </MenuSection>
              <MenuSection title="Единица измерения">
                <MenuOption selected={unit === "rub"} onClick={() => setUnit("rub")}>
                  Рубли
                </MenuOption>
                <MenuOption selected={unit === "qty"} onClick={() => setUnit("qty")}>
                  Штуки
                </MenuOption>
              </MenuSection>
              <MenuSection title="Период">
                {PERIODS.map((p) => (
                  <MenuOption key={p} selected={period === p} onClick={() => setPeriod(p)}>
                    {p} дней
                  </MenuOption>
                ))}
              </MenuSection>
            </div>
          )}
        </div>
      </div>

      {/* График: стрелки ←/→ двигают выделенный день с клавиатуры */}
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
          aria-label={`График «Заказано товаров» за ${period} дней`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        >
          {/* Сетка и подписи оси Y (справа, как компактнее) */}
          {[yMax, yMax / 2].map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={y(v)}
                y2={y(v)}
                stroke="rgb(var(--brand-100))"
                strokeWidth={1}
              />
              <text
                x={w - padR + 8}
                y={y(v) + 4}
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
            y1={y0}
            y2={y0}
            stroke="rgb(var(--brand-200))"
            strokeWidth={1}
          />

          {/* Серия-контекст: заливка-«дымка» + линия */}
          <path d={areaPath(cmp)} fill="var(--chart-2)" fillOpacity={0.15} />
          <path
            d={linePath(cmp)}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Основная серия «Заказано» */}
          <path
            d={linePath(ordered)}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {ordered.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={active === i ? 5 : 4}
              fill={active === i ? "var(--chart-1)" : "rgb(var(--surface))"}
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
          ))}

          {/* Курсор-перекрестие по выбранному дню */}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={padT}
              y2={y0}
              stroke="rgb(var(--brand-300))"
              strokeWidth={1}
            />
          )}

          {/* Подписи оси X: число + «сб»/«вс» под выходными */}
          {days.map((d, i) => {
            if (!showTick(i)) return null;
            const dow = d.getDay();
            const weekend = dow === 0 || dow === 6;
            return (
              <g key={i}>
                <text
                  x={x(i)}
                  y={y0 + 15}
                  fontSize={11}
                  textAnchor="middle"
                  fill="rgb(var(--brand-400))"
                >
                  {String(d.getDate()).padStart(2, "0")}
                </text>
                {weekend && (
                  <text
                    x={x(i)}
                    y={y0 + 28}
                    fontSize={10}
                    textAnchor="middle"
                    fill="rgb(var(--brand-300))"
                  >
                    {fmtWeekday.format(d)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {!hasOrders && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-brand-400">
            Заказов за последние недели пока нет
          </div>
        )}

        {/* Тултип: значения обеих серий за день */}
        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 card p-3 shadow-lg"
            style={{ left: tipLeft, width: tipW }}
          >
            <div className="text-xs font-semibold text-brand-500">
              {fmtDayMonth.format(days[active])}, {fmtWeekday.format(days[active])}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="h-0.5 w-3.5 shrink-0 rounded-full"
                style={{ background: "var(--chart-1)" }}
              />
              <span className="text-sm font-bold tabular-nums text-brand-800">
                {fmtVal(ordered[active])}
              </span>
              <span className="text-xs text-brand-500">заказано</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="h-0.5 w-3.5 shrink-0 rounded-full"
                style={{ background: "var(--chart-2)" }}
              />
              <span className="text-sm font-bold tabular-nums text-brand-800">
                {fmtVal(cmp[active])}
              </span>
              <span className="text-xs text-brand-500">{cmpRowLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Легенда */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-brand-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: "var(--chart-1)" }} />
          Заказано: {rangeLabel(days[0], days[n - 1])}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: "var(--chart-2)" }} />
          {cmpLabel}
        </span>
      </div>

      {/* Таблица тех же значений для скринридеров */}
      <table className="sr-only">
        <caption>Заказано товаров по дням</caption>
        <thead>
          <tr>
            <th>День</th>
            <th>Заказано</th>
            <th>{cmpRowLabel}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={i}>
              <td>{fmtDayMonth.format(d)}</td>
              <td>{fmtVal(ordered[i])}</td>
              <td>{fmtVal(cmp[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Итоги периода */}
      <div className="mt-4 grid gap-4 border-t border-brand-100 pt-4 sm:grid-cols-2">
        <div>
          <div className="text-sm text-brand-500">
            Заказано за {rangeLabel(days[0], days[n - 1])}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-3xl font-extrabold text-brand-800">
              {unit === "rub" ? formatPrice(data.curRub) : `${nf.format(data.curQty)} шт`}
            </span>
            {data.delta !== null && (
              <span
                className={`text-sm font-bold ${
                  data.delta >= 0 ? "text-brand-600" : "text-accent-600"
                }`}
              >
                {data.delta >= 0 ? "+" : "−"}
                {nf1.format(Math.abs(data.delta))}%
              </span>
            )}
            <span className="text-sm text-brand-500">
              {unit === "rub" && `${nf.format(data.curQty)} шт · `}
              {nf.format(data.curOrders)} зак.
            </span>
          </div>
          {data.delta !== null && (
            <div className="mt-0.5 text-xs text-brand-400">
              к прошлому периоду ({rangeLabel(prevDays[0], prevDays[n - 1])})
            </div>
          )}
        </div>
        <div className="sm:border-l sm:border-brand-100 sm:pl-4">
          <div className="text-sm text-brand-500">ТОП товар за период</div>
          {data.topProduct ? (
            <>
              <div className="mt-1 truncate text-lg font-bold text-brand-800">
                {data.topProduct.name}
              </div>
              <div className="text-sm text-brand-500">
                {nf.format(data.topProduct.qty)} шт · {formatPrice(data.topProduct.sum)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-lg font-bold text-brand-300">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-brand-100 py-1 last:border-b-0">
      <div className="px-3 pb-1 pt-2 text-xs font-semibold text-brand-400">{title}</div>
      {children}
    </div>
  );
}

function MenuOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-brand-800 transition hover:bg-brand-100"
    >
      {children}
      {selected && (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-600">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
}
