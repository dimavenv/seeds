import type { Category, Product } from "@/lib/types";

// Демо-данные (зеркало supabase/seed.sql). Используются, когда Supabase
// не настроен — чтобы магазин работал «из коробки» для разработки/превью.

export const demoCategories: Category[] = [
  { id: 1, slug: "ovoshchi", name: "Овощи", sort_order: 10 },
  { id: 2, slug: "zelen", name: "Зелень и травы", sort_order: 20 },
  { id: 3, slug: "yagody", name: "Ягоды", sort_order: 30 },
  { id: 4, slug: "tsvety", name: "Цветы", sort_order: 40 },
  { id: 5, slug: "bakhcha", name: "Бахчевые", sort_order: 50 },
  { id: 6, slug: "mitseliy", name: "Грибной мицелий", sort_order: 60 },
];

const raw: Array<
  [string, string, string, number, string, number, boolean, boolean]
> = [
  ["tomat-bychye-serdtse", "Томат «Бычье сердце»", "Крупноплодный среднеспелый сорт, мясистые плоды до 400 г.", 45, "ovoshchi", 120, true, true],
  ["ogurec-zozulya", "Огурец «Зозуля F1»", "Раннеспелый партенокарпический гибрид для теплиц и грунта.", 39, "ovoshchi", 200, false, true],
  ["perec-kolokolchik", "Перец сладкий «Колокольчик»", "Толстостенный сладкий перец, урожайный.", 52, "ovoshchi", 90, false, false],
  ["morkov-nantskaya", "Морковь «Нантская 4»", "Классический сорт, сладкая, ровные корнеплоды.", 29, "ovoshchi", 300, false, false],
  ["svekla-bordo", "Свёкла «Бордо 237»", "Среднеранний сорт, тёмно-бордовая мякоть.", 27, "ovoshchi", 250, false, false],
  ["kabachok-cukesha", "Кабачок «Цукеша»", "Урожайный цуккини, нежная мякоть.", 33, "ovoshchi", 140, true, false],
  ["ukrop-aligator", "Укроп «Аллигатор»", "Кустовой укроп, ароматная зелень долго не зацветает.", 25, "zelen", 180, false, true],
  ["petrushka-kucheryavaya", "Петрушка «Кудрявая»", "Декоративная и ароматная кудрявая петрушка.", 24, "zelen", 160, false, false],
  ["bazilik-fioletovyy", "Базилик «Фиолетовый»", "Пряный базилик с насыщенным ароматом.", 31, "zelen", 110, true, false],
  ["salat-lollo-rossa", "Салат «Лолло Росса»", "Кудрявый листовой салат, красивая розетка.", 28, "zelen", 130, false, false],
  ["kinza-kinto", "Кинза «Кинто»", "Ароматная зелень кориандра для салатов.", 26, "zelen", 100, false, false],
  ["zemlyanika-aleksandriya", "Земляника «Александрия»", "Ремонтантная безусая земляника, плодоносит всё лето.", 89, "yagody", 70, true, true],
  ["klubnika-saharnaya", "Клубника «Сахарная гигантелла»", "Крупноплодная садовая земляника.", 95, "yagody", 60, false, false],
  ["arbuznaya-yagoda-fizalis", "Физалис «Земляничный»", "Сладкие ягоды для варенья и десертов.", 42, "yagody", 80, false, false],
  ["petuniya-grandiflora", "Петуния «Грандифлора»", "Крупноцветковая петуния, обильное цветение.", 49, "tsvety", 150, true, true],
  ["barhattsy-tagetes", "Бархатцы «Тагетес»", "Неприхотливые яркие цветы, отпугивают вредителей.", 23, "tsvety", 220, false, true],
  ["astra-pomponnaya", "Астра «Помпонная»", "Махровые шаровидные соцветия, микс окрасок.", 35, "tsvety", 130, false, false],
  ["tsiniya-ispolin", "Цинния «Исполин»", "Высокорослая цинния для срезки.", 34, "tsvety", 120, false, false],
  ["kosmeya-chuvstvennost", "Космея «Чувственность»", "Воздушные ромашковидные цветы, смесь окрасок.", 22, "tsvety", 140, false, false],
  ["arbuz-ogonek", "Арбуз «Огонёк»", "Раннеспелый сладкий арбуз для средней полосы.", 38, "bakhcha", 100, false, true],
  ["dynya-kolhoznitsa", "Дыня «Колхозница»", "Ароматная сладкая дыня, проверенный сорт.", 41, "bakhcha", 90, false, false],
  ["tykva-stofuntovaya", "Тыква «Стофунтовая»", "Крупноплодная тыква для хранения.", 36, "bakhcha", 110, false, false],
  ["veshenka-obyknovennaya", "Мицелий «Вёшенка обыкновенная»", "Зерновой мицелий для выращивания вёшенки.", 149, "mitseliy", 50, true, true],
  ["shampinon-dvusporovyy", "Мицелий «Шампиньон двуспоровый»", "Компостный мицелий для шампиньонов.", 159, "mitseliy", 40, false, false],
  ["opyonok-letniy", "Мицелий «Опёнок летний»", "Палочковый мицелий для выращивания на древесине.", 139, "mitseliy", 45, false, false],
];

export const demoProducts: Product[] = raw.map((r, i) => {
  const cat = demoCategories.find((c) => c.slug === r[4])!;
  return {
    id: i + 1,
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
