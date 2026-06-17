-- Демо-данные Semena Collection (реальные категории магазина + примеры товаров)
-- Фото — плейсхолдеры (picsum); заменяются на реальные через админку.

insert into public.categories (slug, name, sort_order) values
  ('tomaty',        'Томаты',          10),
  ('perec-sladkiy', 'Перец сладкий',   20),
  ('perec-chili',   'Перец чили',      30),
  ('baklazhany',    'Баклажаны',       40),
  ('kukuruza',      'Кукуруза',        50),
  ('kartofel',      'Картофель',       60),
  ('dynya',         'Дыня',            70),
  ('arbuz',         'Арбуз',           80)
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
  -- Томаты
  ('tomat-bychye-serdtse',       'Томат «Бычье сердце»',        'Крупноплодный среднеспелый сорт, мясистые плоды до 400 г.', 45.00, 'tomaty', 120, true,  true),
  ('tomat-chernyy-princ',        'Томат «Чёрный принц»',        'Сладкий салатный сорт с тёмно-бордовыми плодами.',          49.00, 'tomaty', 90,  false, false),
  ('tomat-damskie-palchiki',     'Томат «Дамские пальчики»',    'Удлинённые плотные плоды, отлично для консервации.',        39.00, 'tomaty', 140, false, false),
  -- Перец сладкий
  ('perec-kaliforniyskoe-chudo', 'Перец «Калифорнийское чудо»', 'Толстостенный сладкий перец, классика урожая.',            52.00, 'perec-sladkiy', 110, false, true),
  ('perec-bogatyr',              'Перец «Богатырь»',            'Крупный сочный сладкий перец, неприхотливый.',             48.00, 'perec-sladkiy', 100, false, false),
  -- Перец чили
  ('perec-chili-habanero',       'Перец чили «Хабанеро»',       'Очень острый сорт с фруктовым ароматом.',                  69.00, 'perec-chili', 60, true,  true),
  ('perec-chili-kayenskiy',      'Перец чили «Кайенский»',      'Классический острый перец для приправ и соусов.',          55.00, 'perec-chili', 70, false, false),
  -- Баклажаны
  ('baklazhan-almaz',            'Баклажан «Алмаз»',            'Урожайный среднеспелый сорт, плоды без горечи.',           42.00, 'baklazhany', 95, false, true),
  ('baklazhan-chernyy-krasavec', 'Баклажан «Чёрный красавец»',  'Крупные тёмно-фиолетовые плоды, нежная мякоть.',           46.00, 'baklazhany', 85, false, false),
  -- Кукуруза
  ('kukuruza-saharnaya',         'Кукуруза «Сахарная»',         'Сладкая сахарная кукуруза, нежные зёрна.',                 33.00, 'kukuruza', 160, true,  false),
  ('kukuruza-bondyuel',          'Кукуруза «Бондюэль»',         'Раннеспелая сахарная кукуруза для консервации.',           37.00, 'kukuruza', 130, false, false),
  -- Картофель
  ('kartofel-gala',              'Картофель «Гала»',            'Раннеспелый урожайный сорт, отличный вкус.',               89.00, 'kartofel', 70, false, true),
  ('kartofel-rozara',            'Картофель «Розара»',          'Розовый ранний картофель, хорошо хранится.',               95.00, 'kartofel', 60, false, false),
  -- Дыня
  ('dynya-kolhoznitsa',          'Дыня «Колхозница»',           'Ароматная сладкая дыня, проверенный сорт.',                41.00, 'dynya', 90, false, true),
  ('dynya-torpeda',              'Дыня «Торпеда»',              'Крупная удлинённая дыня с медовой мякотью.',               47.00, 'dynya', 80, true,  false),
  -- Арбуз
  ('arbuz-ogonek',               'Арбуз «Огонёк»',              'Раннеспелый сладкий арбуз для средней полосы.',            38.00, 'arbuz', 100, false, true),
  ('arbuz-krimson-svit',         'Арбуз «Кримсон Свит»',        'Крупный сахарный арбуз с тонкой коркой.',                  44.00, 'arbuz', 85, true,  false)
) as v(slug, name, description, price, cat, stock, is_new, is_featured)
on conflict (slug) do nothing;
