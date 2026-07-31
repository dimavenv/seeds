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

// ===== Названия категорий в единственном числе =====
//
// В каталоге, шапке, подвале и хлебных крошках категория называется
// «Томат», «Баклажан» — в единственном числе. Названия хранятся в базе, и
// поменять их там можно скриптом (npm run db:categories), но полагаться
// только на него нельзя: в базе на боевом сервере может остаться старое
// «Томаты», а до запуска скрипта сайт показывал бы множественное число.
// Поэтому подмена делается ещё и при показе — в mapCategory/mapProduct
// (lib/pb/shared.ts), через который проходят ВСЕ категории сайта.
//
// Правило намеренно узкое: заменяется только ИЗВЕСТНАЯ множественная форма
// известной категории. Название, придуманное в админке («Томат черри»,
// «Семена-микс»), остаётся как есть — иначе редактор не смог бы назвать
// категорию по-своему.
const SINGULAR: Record<string, { singular: string; plural: string[] }> = {
  tomaty: { singular: "Томат", plural: ["томаты"] },
  baklazhany: { singular: "Баклажан", plural: ["баклажаны"] },
  "perec-sladkiy": {
    singular: "Перец сладкий",
    plural: ["перцы сладкие", "сладкие перцы", "перцы"],
  },
  "perec-chili": { singular: "Перец чили", plural: ["перцы чили", "чили"] },
  kukuruza: { singular: "Кукуруза", plural: [] },
  kartofel: { singular: "Картофель", plural: [] },
  dynya: { singular: "Дыня", plural: ["дыни"] },
  arbuz: { singular: "Арбуз", plural: ["арбузы"] },
  // Заранее — для категорий, которые могут появиться. Русские формы
  // множественного числа неправильные («огурцы» → «огурец»), автоматически их
  // не вывести, поэтому список явный.
  ogurcy: { singular: "Огурец", plural: ["огурцы"] },
  kabachki: { singular: "Кабачок", plural: ["кабачки"] },
  tykva: { singular: "Тыква", plural: ["тыквы"] },
  kapusta: { singular: "Капуста", plural: ["капусты"] },
  morkov: { singular: "Морковь", plural: ["моркови"] },
  svekla: { singular: "Свёкла", plural: ["свёклы", "свеклы"] },
  redis: { singular: "Редис", plural: ["редисы"] },
  luk: { singular: "Лук", plural: ["луки"] },
  zelen: { singular: "Зелень", plural: [] },
  cvety: { singular: "Цветок", plural: ["цветы"] },
};

// Название категории для показа. Множественное число известной категории
// заменяется на единственное, всё остальное возвращается без изменений.
export function categoryDisplayName(slug: string, name: string): string {
  const rule = SINGULAR[slug];
  const clean = name.trim();
  if (!rule) return clean;
  const lower = clean.toLowerCase();
  if (lower === rule.singular.toLowerCase()) return rule.singular;
  return rule.plural.includes(lower) ? rule.singular : clean;
}
