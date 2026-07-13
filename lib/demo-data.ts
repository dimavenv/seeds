import type { Category, Product } from "@/lib/types";

// Демо-данные. Используются, когда PocketBase не настроен — чтобы магазин
// работал «из коробки» для разработки/превью.

// ID в демо-режиме — строковые (как в PocketBase); используем slug.
export const demoCategories: Category[] = [
  { id: "tomaty", slug: "tomaty", name: "Томаты", sort_order: 10 },
  { id: "perec-sladkiy", slug: "perec-sladkiy", name: "Перец сладкий", sort_order: 20 },
  { id: "perec-chili", slug: "perec-chili", name: "Перец чили", sort_order: 30 },
  { id: "baklazhany", slug: "baklazhany", name: "Баклажаны", sort_order: 40 },
  { id: "kukuruza", slug: "kukuruza", name: "Кукуруза", sort_order: 50 },
  { id: "kartofel", slug: "kartofel", name: "Картофель", sort_order: 60 },
  { id: "dynya", slug: "dynya", name: "Дыня", sort_order: 70 },
  { id: "arbuz", slug: "arbuz", name: "Арбуз", sort_order: 80 },
];

const raw: Array<
  [string, string, string, number, string, number, boolean, boolean]
> = [
  // Томаты
  ["tomat-bychye-serdtse", "Томат «Бычье сердце»", "Крупноплодный среднеспелый сорт, мясистые плоды до 400 г.", 45, "tomaty", 120, true, true],
  ["tomat-chernyy-princ", "Томат «Чёрный принц»", "Сладкий салатный сорт с тёмно-бордовыми плодами.", 49, "tomaty", 90, false, false],
  ["tomat-damskie-palchiki", "Томат «Дамские пальчики»", "Удлинённые плотные плоды, отлично для консервации.", 39, "tomaty", 140, false, false],
  // Перец сладкий
  ["perec-kaliforniyskoe-chudo", "Перец «Калифорнийское чудо»", "Толстостенный сладкий перец, классика урожая.", 52, "perec-sladkiy", 110, false, true],
  ["perec-bogatyr", "Перец «Богатырь»", "Крупный сочный сладкий перец, неприхотливый.", 48, "perec-sladkiy", 100, false, false],
  // Перец чили
  ["perec-chili-habanero", "Перец чили «Хабанеро»", "Очень острый сорт с фруктовым ароматом.", 69, "perec-chili", 60, true, true],
  ["perec-chili-kayenskiy", "Перец чили «Кайенский»", "Классический острый перец для приправ и соусов.", 55, "perec-chili", 70, false, false],
  // Баклажаны
  ["baklazhan-almaz", "Баклажан «Алмаз»", "Урожайный среднеспелый сорт, плоды без горечи.", 42, "baklazhany", 95, false, true],
  ["baklazhan-chernyy-krasavec", "Баклажан «Чёрный красавец»", "Крупные тёмно-фиолетовые плоды, нежная мякоть.", 46, "baklazhany", 85, false, false],
  // Кукуруза
  ["kukuruza-saharnaya", "Кукуруза «Сахарная»", "Сладкая сахарная кукуруза, нежные зёрна.", 33, "kukuruza", 160, true, false],
  ["kukuruza-bondyuel", "Кукуруза «Бондюэль»", "Раннеспелая сахарная кукуруза для консервации.", 37, "kukuruza", 130, false, false],
  // Картофель
  ["kartofel-gala", "Картофель «Гала»", "Раннеспелый урожайный сорт, отличный вкус.", 89, "kartofel", 70, false, true],
  ["kartofel-rozara", "Картофель «Розара»", "Розовый ранний картофель, хорошо хранится.", 95, "kartofel", 60, false, false],
  // Дыня
  ["dynya-kolhoznitsa", "Дыня «Колхозница»", "Ароматная сладкая дыня, проверенный сорт.", 41, "dynya", 90, false, true],
  ["dynya-torpeda", "Дыня «Торпеда»", "Крупная удлинённая дыня с медовой мякотью.", 47, "dynya", 80, true, false],
  // Арбуз
  ["arbuz-ogonek", "Арбуз «Огонёк»", "Раннеспелый сладкий арбуз для средней полосы.", 38, "arbuz", 100, false, true],
  ["arbuz-krimson-svit", "Арбуз «Кримсон Свит»", "Крупный сахарный арбуз с тонкой коркой.", 44, "arbuz", 85, true, false],
];

export const demoProducts: Product[] = raw.map((r, i) => {
  const cat = demoCategories.find((c) => c.slug === r[4])!;
  return {
    id: r[0],
    slug: r[0],
    name: r[1],
    description: r[2],
    price: r[3],
    category_id: cat.id,
    image_url: `https://picsum.photos/seed/${r[0]}/600/600`,
    stock: r[5],
    is_new: r[6],
    is_featured: r[7],
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    category: { slug: cat.slug, name: cat.name },
  };
});
