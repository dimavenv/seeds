-- Корзина и избранное, привязанные к аккаунту.
-- Храним как один JSON-блоб на пользователя: надёжно (один маленький upsert) и
-- легко синхронизируется с localStorage гостя при входе.

create table if not exists public.user_store (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cart       jsonb not null default '[]'::jsonb,
  wishlist   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_store enable row level security;

drop policy if exists user_store_rw on public.user_store;
create policy user_store_rw on public.user_store
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
