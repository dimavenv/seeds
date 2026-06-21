-- 0010 — Усиление безопасности (закрывает находки аудита)
-- Применить в Supabase → SQL Editor → New query → Run.
--
--   #1 (CRITICAL) Эскалация привилегий: пользователь мог выставить себе
--      profiles.role = 'admin' и получить доступ к админ-панели.
--   #2 Обход модерации отзывов: можно было вставить отзыв сразу
--      со status = 'approved' (минуя серверный экшен).
--   #3 Подмена заказов: прямая вставка в orders/order_items из браузера
--      в обход серверного пересчёта цены (total/price/user_id).

-- ============================================================
-- #1 Колоночные привилегии profiles: запрещаем менять role.
-- RLS не ограничивает набор колонок в UPDATE, поэтому режем на уровне GRANT:
-- обычный пользователь сможет править только full_name, но не role.
-- Профиль создаётся триггером handle_new_user (SECURITY DEFINER) и
-- назначается админом из SQL Editor (роль postgres) — их это НЕ затрагивает.
-- ============================================================
revoke update on public.profiles from anon, authenticated;
grant  update (full_name) on public.profiles to authenticated;

-- ============================================================
-- #2 Отзывы: вставить можно только СВОЙ отзыв, только в статусе 'pending'
-- и только к своему уже отправленному/полученному заказу.
-- ============================================================
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and o.user_id = auth.uid()
        and o.status in ('shipped', 'done')
    )
  );

-- ============================================================
-- #3 Заказы/позиции: создаёт только сервер сервисным ключом
-- (app/api/checkout/route.ts → createServiceClient, в обход RLS).
-- Прямую вставку из браузера (anon/authenticated) запрещаем —
-- это убирает подмену total/price/user_id мимо серверного пересчёта.
-- service_role обходит RLS, поэтому штатное оформление продолжит работать.
-- ============================================================
drop policy if exists orders_insert on public.orders;
drop policy if exists order_items_insert on public.order_items;
