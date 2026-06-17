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
