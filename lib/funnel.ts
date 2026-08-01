// Воронка покупки: от захода на сайт до оформленного заказа.
//
// Чистые функции без React и без сети — правила «сколько дошло до шага» и «где
// теряется больше всего» проверяются тестами, а не пересчётом руками по
// готовому экрану.

// Шаги воронки. Порядок важен: каждый следующий — подмножество предыдущего.
// Идентификаторы совпадают с целями Метрики (lib/metrika.ts), кроме первого
// шага: визиты приходят не целью, а обычной метрикой.
export const FUNNEL_STEPS = [
  { key: "visits", label: "Зашли на сайт" },
  { key: "add_to_cart", label: "Положили в корзину" },
  { key: "begin_checkout", label: "Открыли оформление" },
  { key: "submit_order", label: "Нажали «Оформить заказ»" },
  { key: "purchase", label: "Оформили заказ" },
] as const;

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]["key"];

export type FunnelRow = {
  key: FunnelStepKey;
  label: string;
  visits: number; // визиты, дошедшие до шага
  // Доля от визитов сайта, %. У первого шага всегда 100.
  shareOfVisits: number | null;
  // Доля от ПРЕДЫДУЩЕГО шага, % — переход между шагами. У первого шага null.
  shareOfPrev: number | null;
  // Сколько визитов потерялось на переходе к этому шагу.
  lost: number;
};

// Собираем воронку по числу визитов с достижением каждой цели.
//
// Данные Метрики не обязаны быть монотонными: цель могла быть создана позже
// остальных, а событие «нажал Оформить» может прийти без «открыл оформление»
// (человек вернулся в корзину со второго устройства). Мы НЕ подчищаем такие
// строки: подгонять цифры под красивую убывающую лесенку — значит врать.
// Показываем как есть, а доли считаем честно и допускаем > 100%.
export function buildFunnel(
  visits: number,
  goalVisits: Partial<Record<FunnelStepKey, number>>
): FunnelRow[] {
  let prev: number | null = null;

  return FUNNEL_STEPS.map((step) => {
    const value = step.key === "visits" ? visits : goalVisits[step.key] ?? 0;
    const row: FunnelRow = {
      key: step.key,
      label: step.label,
      visits: value,
      shareOfVisits: visits > 0 ? (value / visits) * 100 : null,
      shareOfPrev: prev !== null && prev > 0 ? (value / prev) * 100 : null,
      lost: prev !== null ? Math.max(0, prev - value) : 0,
    };
    prev = value;
    return row;
  });
}

// Ориентиры перехода между шагами для розничного интернет-магазина, %.
// Порядки величин, а не законы природы: до корзины в норме доходит малая часть
// зашедших, а от кнопки «Оформить» до заказа — почти все.
export const EXPECTED_PASS_RATE: Record<FunnelStepKey, number> = {
  visits: 100,
  add_to_cart: 6, // из всех визитов
  begin_checkout: 45, // из тех, кто набрал корзину
  submit_order: 65, // из тех, кто открыл оформление
  purchase: 90, // из тех, кто нажал «Оформить»
};

export type WeakStep = {
  row: FunnelRow;
  expected: number; // сколько обычно доходит на этом переходе, %
  ratio: number; // во сколько раз хуже обычного (0.5 — вдвое хуже)
};

// Самый проблемный переход — не тот, где процент меньше всех, а тот, где он
// сильнее всего ОТСТАЁТ ОТ ОБЫЧНОГО. Иначе ответ всегда один и тот же: «до
// корзины доходит 6%» — так у всех магазинов, чинить там нечего.
//
// Возвращаем null, когда данных мало (советовать по трём визитам нельзя) или
// когда все переходы держатся не хуже ориентиров — тогда узкого места нет.
export function worstStep(rows: FunnelRow[], minVisits = 20): WeakStep | null {
  const total = rows[0]?.visits ?? 0;
  if (total < minVisits) return null;

  let worst: WeakStep | null = null;
  for (const row of rows) {
    if (row.shareOfPrev === null) continue;
    const expected = EXPECTED_PASS_RATE[row.key];
    if (!expected) continue;
    const ratio = row.shareOfPrev / expected;
    if (ratio >= 1) continue; // не хуже обычного — не о чем говорить
    if (!worst || ratio < worst.ratio) worst = { row, expected, ratio };
  }
  return worst;
}
