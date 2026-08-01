import type { BreakdownRow } from "@/lib/metrika-stats";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

// Срез посещаемости (источники, устройства, города, страницы входа) —
// горизонтальные полосы, отсортированные по убыванию.
//
// Полосы горизонтальные, потому что подписи длинные («Переходы из поисковых
// систем») — в столбиках их пришлось бы наклонять или резать. Цвет один на
// весь блок: строки здесь — не разные сущности, которые нужно различать, а
// один и тот же показатель у разных значений; раскрашивать их в семь цветов
// значило бы кодировать цветом ранг, а он и так виден по длине.
export default function BreakdownBars({
  title,
  rows,
  empty = "Нет данных за период",
}: {
  title: string;
  rows: BreakdownRow[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  const sum = rows.reduce((s, r) => s + r.visits, 0);

  return (
    <div className="card p-5">
      <h3 className="font-bold text-brand-800">{title}</h3>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-brand-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => {
            const share = sum > 0 ? (r.visits / sum) * 100 : 0;
            return (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-brand-700" title={r.name}>
                    {r.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-brand-500">
                    {nf.format(r.visits)}
                    <span className="ml-1.5 text-xs text-brand-400">
                      {nf1.format(share)}%
                    </span>
                  </span>
                </div>
                {/* Дорожка — светлый шаг той же шкалы, а не серый: состояние
                    читается по всей ширине полосы. */}
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, (r.visits / max) * 100)}%`,
                      background: "var(--chart-1)",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
