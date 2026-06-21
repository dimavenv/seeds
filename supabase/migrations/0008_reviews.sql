-- Отзывы покупателей с модерацией. Отзыв оставляют к заказу после получения;
-- публикуется только после одобрения администратором.
create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  order_id    bigint references public.orders(id) on delete set null,
  author_name text not null default '',
  rating      int not null check (rating between 1 and 5),
  text        text not null,
  status      text not null default 'pending', -- pending | approved | rejected
  created_at  timestamptz not null default now()
);
create index if not exists reviews_status_idx on public.reviews(status, created_at desc);

alter table public.reviews enable row level security;

-- Читать можно одобренные; свои — автор; все — админ.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select
  using (status = 'approved' or public.is_admin() or user_id = auth.uid());

-- Оставить отзыв может вошедший пользователь от своего имени.
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert
  with check (user_id = auth.uid());

-- Модерация (смена статуса) — только админ.
drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews for update
  using (public.is_admin()) with check (public.is_admin());
