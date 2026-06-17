-- Демо-данные Semena Collection (категории как у LETTO + примеры товаров)
-- Фото — плейсхолдеры (picsum); заменяются на реальные через админку.

insert into public.categories (slug, name, sort_order) values
  ('ovoshchi',  'Овощи',            10),
  ('zelen',     'Зелень и травы',   20),
  ('yagody',    'Ягоды',            30),
  ('tsvety',    'Цветы',            40),
  ('bakhcha',   'Бахчевые',         50),
  ('mitseliy',  'Грибной мицелий',  60)
on conflict (slug) do nothing;

-- Товары. category_id берём по slug категории.
with c as (
  select slug, id from public.categories
)
insert into public.products (slug, name, description, price, category_id, image_url, stock, is_new, is_featured)
select v.slug, v.name, v.description, v.price,
       (select id from c where c.slug = v.cat),
       'https://picsum.photos/seed/' || v.slug || '/600/600',
       v.stock, v.is_new, v.is_featured
from (values
  -- Овощи
  ('tomat-bychye-serdtse', 'Томат «Бычье сердце»', 'Крупноплодный среднеспелый сорт, мясистые плоды до 400 г.', 45.00, 'ovoshchi', 120, true,  true),
  ('ogurec-zozulya',       'Огурец «Зозуля F1»',   'Раннеспелый партенокарпический гибрид для теплиц и грунта.',   39.00, 'ovoshchi', 200, false, true),
  ('perec-kolokolchik',    'Перец сладкий «Колокольчик»', 'Толстостенный сладкий перец, урожайный.',             52.00, 'ovoshchi', 90,  false, false),
  ('morkov-nantskaya',     'Морковь «Нантская 4»', 'Классический сорт, сладкая, ровные корнеплоды.',              29.00, 'ovoshchi', 300, false, false),
  ('svekla-bordo',         'Свёкла «Бордо 237»',   'Среднеранний сорт, тёмно-бордовая мякоть.',                   27.00, 'ovoshchi', 250, false, false),
  ('kabachok-cukesha',     'Кабачок «Цукеша»',     'Урожайный цуккини, нежная мякоть.',                           33.00, 'ovoshchi', 140, true,  false),
  -- Зелень и травы
  ('ukrop-aligator',       'Укроп «Аллигатор»',    'Кустовой укроп, ароматная зелень долго не зацветает.',        25.00, 'zelen', 180, false, true),
  ('petrushka-kucheryavaya','Петрушка «Кудрявая»', 'Декоративная и ароматная кудрявая петрушка.',                 24.00, 'zelen', 160, false, false),
  ('bazilik-fioletovyy',   'Базилик «Фиолетовый»', 'Пряный базилик с насыщенным ароматом.',                       31.00, 'zelen', 110, true,  false),
  ('salat-lollo-rossa',    'Салат «Лолло Росса»',  'Кудрявый листовой салат, красивая розетка.',                  28.00, 'zelen', 130, false, false),
  ('kinza-kinto',          'Кинза «Кинто»',        'Ароматная зелень кориандра для салатов.',                     26.00, 'zelen', 100, false, false),
  -- Ягоды
  ('zemlyanika-aleksandriya','Земляника «Александрия»', 'Ремонтантная безусая земляника, плодоносит всё лето.',   89.00, 'yagody', 70, true,  true),
  ('klubnika-saharnaya',   'Клубника «Сахарная гигантелла»', 'Крупноплодная садовая земляника.',                  95.00, 'yagody', 60, false, false),
  ('arbuznaya-yagoda-fizalis','Физалис «Земляничный»', 'Сладкие ягоды для варенья и десертов.',                   42.00, 'yagody', 80, false, false),
  -- Цветы
  ('petuniya-grandiflora', 'Петуния «Грандифлора»',  'Крупноцветковая петуния, обильное цветение.',               49.00, 'tsvety', 150, true,  true),
  ('barhattsy-tagetes',    'Бархатцы «Тагетес»',     'Неприхотливые яркие цветы, отпугивают вредителей.',         23.00, 'tsvety', 220, false, true),
  ('astra-pomponnaya',     'Астра «Помпонная»',      'Махровые шаровидные соцветия, микс окрасок.',               35.00, 'tsvety', 130, false, false),
  ('tsiniya-ispolin',     'Цинния «Исполин»',       'Высокорослая цинния для срезки.',                            34.00, 'tsvety', 120, false, false),
  ('kosmeya-chuvstvennost','Космея «Чувственность»', 'Воздушные ромашковидные цветы, смесь окрасок.',             22.00, 'tsvety', 140, false, false),
  -- Бахчевые
  ('arbuz-ogonek',         'Арбуз «Огонёк»',         'Раннеспелый сладкий арбуз для средней полосы.',             38.00, 'bakhcha', 100, false, true),
  ('dynya-kolhoznitsa',    'Дыня «Колхозница»',      'Ароматная сладкая дыня, проверенный сорт.',                 41.00, 'bakhcha', 90,  false, false),
  ('tykva-stofuntovaya',   'Тыква «Стофунтовая»',    'Крупноплодная тыква для хранения.',                          36.00, 'bakhcha', 110, false, false),
  -- Грибной мицелий
  ('veshenka-obyknovennaya','Мицелий «Вёшенка обыкновенная»', 'Зерновой мицелий для выращивания вёшенки.',        149.00, 'mitseliy', 50, true, true),
  ('shampinon-dvusporovyy','Мицелий «Шампиньон двуспоровый»', 'Компостный мицелий для шампиньонов.',              159.00, 'mitseliy', 40, false, false),
  ('opyonok-letniy',       'Мицелий «Опёнок летний»', 'Палочковый мицелий для выращивания на древесине.',         139.00, 'mitseliy', 45, false, false)
) as v(slug, name, description, price, cat, stock, is_new, is_featured)
on conflict (slug) do nothing;
