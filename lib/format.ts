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

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
