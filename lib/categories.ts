// Иконки категорий: нарисованные картинки, а где картинки нет — эмодзи.

// Эмодзи-фолбэк: подстрахует новую категорию, которую заведут в админке
// раньше, чем нарисуют для неё картинку.
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
  // Заведёте новую категорию — положите public/categories/<слаг>.webp
  // (квадрат 128×128, прозрачный фон) и допишите слаг сюда. Пока файла нет,
  // категория показывается эмодзи из categoryEmoji — ничего не ломается.
  //
  // После добавления прогоните `npm run img:icons`: скрипт впишет рисунок в те
  // же 117px из 128, что и у остальных. Без этого новая иконка окажется крупнее
  // соседних и будет выглядеть вылезшей за круглый чип.
]);

// Путь к иконке категории или null, если её нет.
export function getCategoryIcon(slug: string): string | null {
  return CATEGORY_ICONS.has(slug) ? `/categories/${slug}.webp` : null;
}
