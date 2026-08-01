import {
  buildFunnel,
  worstStep,
  type FunnelStepKey,
  type FunnelRow,
} from "@/lib/funnel";
import type { GoalStat } from "@/lib/metrika-stats";
import { plural } from "@/lib/format";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

// «2 человека из 100» вместо «2,1 из 100»: доли человека не бывает, а при
// конверсии меньше процента честнее считать на тысячу заходов — иначе
// получается «0 из 100», и владельцу кажется, что не покупает вообще никто.
function humanRate(conv: number | null): string | null {
  if (conv === null || conv <= 0) return null;
  if (conv >= 1) {
    const n = Math.round(conv);
    return `${n} ${plural(n, ["человек", "человека", "человек"])} из 100 зашедших`;
  }
  const n = Math.max(1, Math.round(conv * 10));
  return `${n} ${plural(n, ["человек", "человека", "человек"])} из 1000 зашедших`;
}

// Что обычно чинят, когда покупатели теряются именно на этом переходе.
// Текст привязан к шагу, а не к общей «низкой конверсии»: советовать «улучшите
// сайт» бесполезно, а «на оформлении отваливается половина» — уже задача.
const ADVICE: Record<FunnelStepKey, string> = {
  visits: "",
  add_to_cart:
    "Люди уходят, не дойдя до корзины. Обычно дело в карточке товара: мало фото, нет описания сорта (срок созревания, урожайность, вкус), нет в наличии или цена выше, чем у соседей в выдаче. Посмотрите отчёт «Страницы входа» и Вебвизор — видно, докуда листают.",
  begin_checkout:
    "Корзину набирают, но до оформления не доходят. Чаще всего пугает доставка: её стоимость видна только в корзине, или не заметен порог бесплатной доставки. Помогает показывать условия доставки прямо в карточке товара.",
  submit_order:
    "Оформление открывают, но не отправляют. Смотрите на форму: длинный список полей, капча, обязательный адрес ПВЗ. Вебвизор покажет, на каком поле бросают.",
  purchase:
    "Кнопку нажимают, а заказ не оформляется — это уже техника, а не маркетинг. Проверьте цель «Оплата не прошла», ошибки оплаты и заказы со статусом «Ожидает оплаты».",
};

// Ориентиры по конверсии интернет-магазина в рознице. Нужны, чтобы число «1,4%»
// хоть что-то значило для человека, который видит его впервые.
function conversionVerdict(conv: number | null): { text: string; tone: string } {
  if (conv === null) {
    return { text: "Пока не из чего считать", tone: "text-brand-400" };
  }
  if (conv >= 2) {
    return { text: "Отличный результат для магазина семян", tone: "text-brand-600" };
  }
  if (conv >= 0.8) {
    return { text: "Нормально: обычный магазин живёт в этом диапазоне", tone: "text-brand-600" };
  }
  if (conv > 0) {
    return { text: "Ниже обычного — смотрите, где теряются люди", tone: "text-accent-600" };
  }
  return { text: "Заказов за период не было", tone: "text-brand-400" };
}

export default function GoalFunnel({
  goals,
  visits,
  periodLabel,
}: {
  goals: GoalStat[];
  visits: number;
  periodLabel: string;
}) {
  const byGoal = new Map(goals.map((g) => [g.goal, g.visits]));
  const rows = buildFunnel(visits, {
    add_to_cart: byGoal.get("add_to_cart"),
    begin_checkout: byGoal.get("begin_checkout"),
    submit_order: byGoal.get("submit_order"),
    purchase: byGoal.get("purchase"),
  });

  const purchase = rows[rows.length - 1];
  const conv = purchase.shareOfVisits;
  const verdict = conversionVerdict(conv);
  const rate = humanRate(conv);
  const weak = worstStep(rows);

  // Остальные цели — не части воронки, а отдельные события. Показываем
  // числами: сравнивать «поиск» с «отзывом» столбиками бессмысленно.
  const funnelKeys = new Set([
    "add_to_cart",
    "begin_checkout",
    "submit_order",
    "purchase",
  ]);
  const others = goals.filter((g) => !funnelKeys.has(g.goal));

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-bold text-brand-800">Путь покупателя</h2>
        <span className="text-sm text-brand-500">{periodLabel}</span>
      </div>
      <p className="mt-1 text-sm text-brand-600">
        Сколько визитов дошло до каждого шага. Данные Яндекс.Метрики по целям —
        считаются визиты, а не клики: один человек, положивший в корзину пять
        сортов, — это один визит.
      </p>

      {visits === 0 ? (
        <p className="mt-4 text-sm text-brand-400">
          За этот период визитов ещё нет. Цели заведены — цифры появятся, как
          только на сайт начнут заходить люди (Метрика показывает данные с
          задержкой до нескольких часов).
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {rows.map((row, i) => (
            <li key={row.key}>
              {/* Переход от предыдущего шага — над строкой, к которой относится */}
              {row.shareOfPrev !== null && (
                <div className="mb-1 flex items-center gap-2 pl-1 text-xs text-brand-400">
                  <span aria-hidden>↓</span>
                  <span>
                    дошли {nf1.format(row.shareOfPrev)}%
                    {row.lost > 0 && <> · ушли {nf.format(row.lost)}</>}
                  </span>
                </div>
              )}
              <StepBar row={row} highlight={i === rows.length - 1} />
            </li>
          ))}
        </ol>
      )}

      {/* Что всё это значит и что с этим делать */}
      <div className="mt-5 border-t border-brand-100 pt-4">
        <h3 className="font-bold text-brand-800">Конверсия — это что</h3>
        <p className="mt-1 text-sm text-brand-600">
          Доля визитов, которые закончились заказом. Ваши{" "}
          <b className="text-brand-800">
            {conv === null ? "—" : `${nf1.format(conv)}%`}
          </b>{" "}
          {rate ? (
            <>
              читаются так: заказ оформляют{" "}
              <b className="text-brand-800">{rate}</b>.{" "}
            </>
          ) : (
            <>— </>
          )}
          <span className={verdict.tone}>{verdict.text}.</span>
        </p>
        <p className="mt-2 text-sm text-brand-600">
          Само по себе это число ни хорошее, ни плохое — смысл в том, куда оно
          движется. Растёт при том же количестве заходов — сайт стал понятнее.
          Падает после рекламы — привели не тех людей. Гнаться за «средней по
          рынку» цифрой не нужно: у сезонных семян она скачет сама по себе.
        </p>

        {weak && ADVICE[weak.row.key] && (
          <div className="mt-3 rounded-xl bg-brand-50 p-4">
            <div className="text-sm font-semibold text-brand-800">
              Самое узкое место: «{weak.row.label}» — доходит{" "}
              {nf1.format(weak.row.shareOfPrev ?? 0)}% вместо обычных{" "}
              {nf.format(weak.expected)}%
            </div>
            <p className="mt-1 text-sm text-brand-600">{ADVICE[weak.row.key]}</p>
          </div>
        )}
        {!weak && visits > 0 && (
          <p className="mt-3 text-xs text-brand-400">
            Узкого места не видно: либо все переходы держатся не хуже обычных для
            интернет-магазина, либо данных пока слишком мало (советы появляются
            от двух десятков визитов за период).
          </p>
        )}
      </div>

      {others.length > 0 && (
        <div className="mt-5 border-t border-brand-100 pt-4">
          <h3 className="font-bold text-brand-800">Остальные события</h3>
          <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((g) => (
              <div key={g.goal} className="min-w-0">
                <div className="truncate text-sm text-brand-500" title={g.name}>
                  {g.name}
                </div>
                <div className="text-xl font-bold text-brand-800">
                  {nf.format(g.visits)}
                  <span className="ml-1.5 text-xs font-semibold text-brand-400">
                    {plural(g.visits, ["визит", "визита", "визитов"])}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepBar({ row, highlight }: { row: FunnelRow; highlight: boolean }) {
  const share = row.shareOfVisits ?? 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-brand-700">{row.label}</span>
        <span className="shrink-0 tabular-nums text-brand-500">
          <b className={highlight ? "text-brand-600" : "text-brand-800"}>
            {nf.format(row.visits)}
          </b>
          {row.shareOfVisits !== null && (
            <span className="ml-1.5 text-xs text-brand-400">
              {nf1.format(share)}%
            </span>
          )}
        </span>
      </div>
      {/* Дорожка во всю ширину = все визиты сайта; заливка — доля дошедших.
          Минимальные 2px оставляем, чтобы ненулевой шаг не выглядел пустым. */}
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(row.visits > 0 ? 2 : 0, share))}%`,
            background: "var(--chart-1)",
          }}
        />
      </div>
    </div>
  );
}
