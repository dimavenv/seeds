// Промокоды — общая (изоморфная) часть: нормализация кода и расчёт скидки.
//
// Здесь НЕТ ни списка кодов, ни чтения окружения: файл импортируется и
// браузером (корзина показывает скидку), а список действующих кодов —
// серверная тайна. Клиент получает описание скидки только от сервера
// (POST /api/promo) и лишь ПОКАЗЫВАЕТ её; окончательную сумму всегда
// пересчитывает /api/checkout по своим правилам (см. lib/promo-server.ts).

// Длиннее этого кода не бывает — обрезаем, чтобы не гонять по базе и по
// регуляркам километровые строки из формы.
export const PROMO_CODE_MAX_LENGTH = 32;

export type PromoRule = {
  // Канонический код («УРОЖАЙ») — показываем именно его, а не то, что ввёл
  // покупатель: ввод в интерфейс не возвращаем.
  code: string;
  // Скидка в процентах от суммы товаров (0 — не используется).
  percent: number;
  // Фиксированная скидка в рублях (учитывается, только если percent = 0).
  amount: number;
  // Минимальная сумма товаров, с которой код работает (0 — без ограничения).
  minSubtotal: number;
  // Короткая подпись для интерфейса и писем: «−10% на товары».
  label: string;
};

// Приведение введённого кода к единому виду: без пробелов, дефисов и
// невидимых символов, в верхнем регистре, не длиннее PROMO_CODE_MAX_LENGTH.
export function normalizePromoCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    // Сначала грубо обрезаем: на вход может прийти мегабайт текста, гонять по
    // нему нормализацию и регулярки незачем.
    .slice(0, 200)
    .normalize("NFKC")
    // Пробелы (включая неразрывный), нулевой ширины, точки, дефисы и
    // подчёркивания — всё, чем покупатель может «украсить» код при вводе.
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff._-]+/g, "")
    .toUpperCase()
    .slice(0, PROMO_CODE_MAX_LENGTH);
}

// Кириллические буквы, неотличимые на вид от латинских. Нужны для сравнения:
// код, скопированный из мессенджера или набранный со смешанной раскладкой,
// часто содержит латинские «O», «P», «A» вместо кириллических — покупатель
// видит «УРОЖАЙ», а строки не совпадают.
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H",
  О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
};

// Ключ сравнения: обе стороны (введённый код и код правила) приводятся к
// одному алфавиту, поэтому подмена похожей буквой не мешает и не создаёт
// новых кодов — просто больше написаний ведут к тому же единственному коду.
export function promoKey(code: unknown): string {
  return normalizePromoCode(code).replace(
    /[А-ЯЁ]/g,
    (ch) => LOOKALIKE[ch] ?? ch
  );
}

export function promoCodesMatch(a: unknown, b: unknown): boolean {
  const key = promoKey(a);
  return key !== "" && key === promoKey(b);
}

// Скидка в рублях от суммы ТОВАРОВ (доставка не дешевеет).
// Округление вниз до рубля — скидка никогда не больше объявленной; результат
// не превышает сумму товаров, поэтому «к оплате» не уходит в минус.
export function promoDiscount(
  rule: Pick<PromoRule, "percent" | "amount" | "minSubtotal">,
  subtotal: number
): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (subtotal < (rule.minSubtotal || 0)) return 0;
  const raw =
    rule.percent > 0 ? (subtotal * rule.percent) / 100 : Math.max(0, rule.amount);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.floor(Math.min(raw, subtotal)));
}

// Подпись скидки для интерфейса и писем. Проценты имеют приоритет над
// фиксированной суммой — так же, как в promoDiscount.
export function promoLabel(rule: Pick<PromoRule, "percent" | "amount">): string {
  if (rule.percent > 0) return `−${rule.percent}% на товары`;
  if (rule.amount > 0) return `−${rule.amount} ₽ на заказ`;
  return "";
}

// ===== Срок действия =====
//
// Даты сравниваем СТРОКАМИ «ГГГГ-ММ-ДД», а не мгновениями времени. Продавец
// думает днями («до 31 августа включительно»), сервер живёт по UTC, покупатель
// — по своему поясу; сравнение дат-строк убирает из этого весь часовой
// арифметический фольклор. Цена решения — код перестаёт работать в полночь по
// времени сервера, и это ровно то, чего ждёт продавец.

// «2026-08-31 00:00:00.000Z» / «2026-08-31T00:00:00Z» → «2026-08-31».
export function promoDateKey(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

export function todayKey(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export type PromoSchedule = {
  enabled: boolean;
  startsAt: string; // «» — без ограничения
  expiresAt: string;
};

export type PromoStatus = "active" | "disabled" | "scheduled" | "expired";

export function promoStatus(
  p: PromoSchedule,
  today: string = todayKey()
): PromoStatus {
  if (!p.enabled) return "disabled";
  const from = promoDateKey(p.startsAt);
  const to = promoDateKey(p.expiresAt);
  if (from && today < from) return "scheduled";
  // Последний день — рабочий: «действует по 31 августа» значит, что 31-го код
  // ещё принимается.
  if (to && today > to) return "expired";
  return "active";
}

// Где браузер держит применённый промокод. Только для показа: между корзиной
// и оформлением, и чтобы код не терялся при перезагрузке. На сервер отсюда
// уходит лишь сам код — скидку сервер считает сам.
export const PROMO_STORAGE_KEY = "sc_promo";

export function readStoredPromo(): PromoRule | null {
  try {
    const raw = localStorage.getItem(PROMO_STORAGE_KEY);
    return raw ? parsePromoRule(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStoredPromo(rule: PromoRule | null): void {
  try {
    if (rule) localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(rule));
    else localStorage.removeItem(PROMO_STORAGE_KEY);
  } catch {
    // приватный режим / переполненное хранилище — промокод просто не запомнится
  }
}

// Проверка описания скидки, пришедшего из localStorage: там лежит копия
// ответа сервера, а её мог подправить кто угодно. Кривой объект просто
// выбрасываем (скидка не показывается), а показанную скидку всё равно
// перепроверяет сервер при оформлении.
export function parsePromoRule(raw: unknown): PromoRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = normalizePromoCode(r.code);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const percent = num(r.percent);
  const amount = num(r.amount);
  if (!code) return null;
  if (percent < 0 || percent > 100 || amount < 0) return null;
  if (percent === 0 && amount === 0) return null;
  return {
    code,
    percent,
    amount,
    minSubtotal: Math.max(0, num(r.minSubtotal)),
    label: typeof r.label === "string" ? r.label.slice(0, 80) : "",
  };
}
