// Плитка показателя: подпись, крупное значение и (необязательно) изменение к
// прошлому периоду. Ряд таких плиток заменяет столбиковую диаграмму по пяти
// разнородным числам — сравнивать «визиты» с «конверсией» столбиками нечестно,
// у них разные единицы.
//
// Значение набрано пропорциональными цифрами (без tabular-nums): моноширинные
// нужны там, где числа выстроены в столбец, а крупное одиночное число от них
// только рыхлеет.
export default function StatTile({
  label,
  value,
  delta,
  hint,
  accent,
}: {
  label: string;
  value: string;
  // Изменение к прошлому периоду в процентах. null — сравнивать не с чем.
  delta?: number | null;
  hint?: string;
  // Выделяет главную плитку блока (заказы/конверсия) — цветом значения.
  accent?: boolean;
}) {
  const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

  return (
    <div className="min-w-0">
      <div className="truncate text-sm text-brand-500">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`text-2xl font-extrabold ${
            accent ? "text-brand-600" : "text-brand-800"
          }`}
        >
          {value}
        </span>
        {delta !== undefined && delta !== null && (
          // Направление кодируем И знаком, И цветом: одного цвета мало.
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
      {hint && <div className="mt-0.5 text-xs text-brand-400">{hint}</div>}
    </div>
  );
}
