-- Источник отзыва: null = собственный, 'ozon' = перенесён с Ozon.
alter table public.reviews add column if not exists source text default null;

-- Разрешить администратору вставлять отзывы напрямую (перенесённые с Ozon и т.д.)
drop policy if exists reviews_admin_insert on public.reviews;
create policy reviews_admin_insert on public.reviews for insert
  with check (public.is_admin());
