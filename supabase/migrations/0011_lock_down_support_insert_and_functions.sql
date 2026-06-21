-- 0011 — Продолжение усиления безопасности (по адвайзорам Supabase)
-- Применить в Supabase → SQL Editor → New query → Run.
--
--   #3b Заявки в поддержку: прямая вставка из браузера (как с заказами в 0010).
--   #4b Триггерная функция handle_new_user торчала в публичном REST RPC.

-- ============================================================
-- #3b Заявки в поддержку создаёт только сервер сервисным ключом
-- (app/api/support/route.ts → createServiceClient, в обход RLS).
-- Закрываем прямую вставку из браузера (anon/authenticated).
-- ============================================================
drop policy if exists support_requests_insert on public.support_requests;

-- ============================================================
-- #4b Прячем триггерную функцию из публичного REST RPC. Триггеру
-- on_auth_user_created права EXECUTE вызывающей роли не нужны, поэтому
-- отзыв ничего не ломает, но убирает вызов /rest/v1/rpc/handle_new_user.
-- (is_admin() намеренно НЕ трогаем — её вызывают RLS-политики.)
-- ============================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
