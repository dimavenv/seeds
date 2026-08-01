export function formatPrice(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

// «10 семян», «1 семя», «3 семени» — корректное склонение.
export function seedsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "семян";
  if (mod10 === 1 && mod100 !== 11) word = "семя";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    word = "семени";
  return `${n} ${word}`;
}

// Склонение существительного после числа: «1 визит», «2 визита», «5 визитов».
// Формы передаются в порядке [1, 2, 5] — как принято в русских словарях.
export function plural(
  n: number,
  forms: [one: string, few: string, many: string]
): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

// «5 июля 2026» из строки 'YYYY-MM-DD' (без сдвига по часовому поясу).
export function formatDateRu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
