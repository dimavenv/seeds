-- Глобальные настройки сайта (одна строка). Пока — дата окончания отпуска.
create table if not exists public.site_settings (
  id             int primary key default 1,
  vacation_until date,
  updated_at     timestamptz not null default now(),
  constraint site_settings_single check (id = 1)
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Читать может любой (нужно для плашки на сайте), менять — только админ.
drop policy if exists site_settings_select on public.site_settings;
create policy site_settings_select on public.site_settings for select using (true);

drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings for update
  using (public.is_admin()) with check (public.is_admin());
