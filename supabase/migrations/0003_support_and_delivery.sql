-- Tomat Semena — фиксированная доставка + заявки в поддержку
-- 1) Поля способа/стоимости доставки в orders
-- 2) Таблица support_requests (форма «Поддержка»)

-- ============ ДОСТАВКА В ЗАКАЗАХ ============
alter table public.orders
  add column if not exists delivery_method text;
alter table public.orders
  add column if not exists delivery_cost numeric(10,2) not null default 0;

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

alter table public.support_requests enable row level security;

-- Любой посетитель может отправить заявку (как гостевой заказ)
drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert on public.support_requests
  for insert with check (true);

-- Читают/правят заявки только администраторы
drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select on public.support_requests
  for select using (public.is_admin());
drop policy if exists support_requests_update on public.support_requests;
create policy support_requests_update on public.support_requests
  for update using (public.is_admin()) with check (public.is_admin());
