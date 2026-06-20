-- Semena Collection — ПОЛНАЯ установка одним файлом
-- Вставьте всё содержимое в Supabase → SQL Editor → New query → Run
-- (схема + RLS + storage + демо-товары)

-- Semena Collection — начальная схема
-- Категории, товары, заказы, позиции заказа, профили + RLS

-- ============ ENUM статусов заказа ============
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('new', 'processing', 'shipped', 'done', 'cancelled');
  end if;
end$$;

-- ============ КАТЕГОРИИ ============
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ============ ТОВАРЫ ============
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  price       numeric(10,2) not null default 0,
  category_id bigint references public.categories(id) on delete set null,
  image_url   text,
  images      text[] not null default '{}',
  stock       int not null default 0,
  is_new      boolean not null default false,
  is_featured boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists products_category_id_idx on public.products(category_id);

-- ============ ЗАКАЗЫ ============
create table if not exists public.orders (
  id            bigint generated always as identity primary key,
  customer_name text not null,
  phone         text not null,
  email         text,
  address       text not null,
  comment       text,
  status        order_status not null default 'new',
  total         numeric(10,2) not null default 0,
  delivery_method text,
  delivery_cost numeric(10,2) not null default 0,
  user_id       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists orders_user_id_idx on public.orders(user_id);

-- ============ ПОЗИЦИИ ЗАКАЗА ============
create table if not exists public.order_items (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  name       text not null,
  price      numeric(10,2) not null,
  qty        int not null default 1
);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- ============ ПРОФИЛИ (роль для гейтинга админки) ============
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'customer',
  full_name  text,
  created_at timestamptz not null default now()
);

-- ============ ЗАЯВКИ В ПОДДЕРЖКУ ============
create table if not exists public.support_requests (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  status     text not null default 'new',
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists support_requests_created_at_idx
  on public.support_requests(created_at desc);

-- ============ КОРЗИНА/ИЗБРАННОЕ ПОЛЬЗОВАТЕЛЯ ============
create table if not exists public.user_store (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cart       jsonb not null default '[]'::jsonb,
  wishlist   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Хелпер: текущий пользователь — админ?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS ============
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.profiles    enable row level security;
alter table public.support_requests enable row level security;
alter table public.user_store  enable row level security;

-- Категории: публичное чтение, запись только админ
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select using (true);
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Товары: публичное чтение, запись только админ
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (true);
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- Заказы: insert разрешён всем (гостевой заказ); select/update — админ или владелец
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (true);
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

-- Позиции заказа: insert всем; select — админ или владелец заказа
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items for insert with check (true);
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id is not null and o.user_id = auth.uid()
    )
  );

-- Профили: пользователь видит/правит свой; админ видит все
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Заявки в поддержку: отправить может любой; читать/править — только админ
drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert on public.support_requests
  for insert with check (true);
drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select on public.support_requests
  for select using (public.is_admin());
drop policy if exists support_requests_update on public.support_requests;
create policy support_requests_update on public.support_requests
  for update using (public.is_admin()) with check (public.is_admin());

-- Корзина/избранное: пользователь видит и правит только своё
drop policy if exists user_store_rw on public.user_store;
create policy user_store_rw on public.user_store
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage bucket для фото товаров: публичное чтение, запись — админ

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product images admin write" on storage.objects;
create policy "product images admin write" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

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
