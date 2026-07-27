// Работа с текстом описания сорта: и для показа на странице, и для meta.

// Описание сорта хранится одним текстовым полем; абзацы продавец разделяет
// пустой строкой. Разбиваем их здесь, чтобы страница вывела <p> на каждый
// абзац, а не одну простыню в 400 слов: так текст читается человеком, а
// поисковик видит структуру. Одиночные переводы строки сохраняем внутри
// абзаца — за это отвечает CSS (whitespace-pre-line).
export function descriptionParagraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Текст для meta description: сплошной строкой, обрезанный по границе слова.
// Поисковики показывают в сниппете примерно 160–200 символов, остальное всё
// равно отбрасывается — но обрывать посреди слова некрасиво.
export function truncateForMeta(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?\s-]+$/, "")}…`;
}
