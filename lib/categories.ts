// Эмодзи категорий (фолбэк-иконки вместо картинок). Используется в каталоге.
export const categoryEmoji: Record<string, string> = {
  tomaty: "🍅",
  "perec-sladkiy": "🫑",
  "perec-chili": "🌶️",
  baklazhany: "🍆",
  kukuruza: "🌽",
  kartofel: "🥔",
  dynya: "🍈",
  arbuz: "🍉",
};

export function getCategoryEmoji(slug: string): string {
  return categoryEmoji[slug] ?? "🌱";
}
