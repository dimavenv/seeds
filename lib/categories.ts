// Иконки категорий: нарисованные картинки, а где картинки нет — эмодзи.

// Эмодзи-фолбэк. Нужен не «на всякий случай»: у кукурузы своей иконки в
// наборе нет, и она показывается именно эмодзи. Плюс подстрахует новую
// категорию, которую заведут в админке раньше, чем нарисуют для неё картинку.
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

// Слаги, для которых в public/categories лежит нарисованная иконка.
// Список явный, а не «проверим, есть ли файл»: на клиенте файловой системы
// нет, а гадать по 404 — значит ловить битые картинки на каждой странице.
const CATEGORY_ICONS = new Set([
  "tomaty",
  "perec-sladkiy",
  "perec-chili",
  "baklazhany",
  "arbuz",
  "dynya",
  "kartofel",
  "kukuruza",
  // TODO: кукурузы (kukuruza) в присланном наборе не было — пока эмодзи 🌽.
  // Появится файл public/categories/kukuruza.webp — допишите сюда слаг.
]);

// Путь к иконке категории или null, если её нет.
export function getCategoryIcon(slug: string): string | null {
  return CATEGORY_ICONS.has(slug) ? `/categories/${slug}.webp` : null;
}
