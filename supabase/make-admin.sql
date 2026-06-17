-- Назначить пользователя администратором.
-- Замените email на свой и выполните в Supabase → SQL Editor.
-- Работает, даже если строки профиля ещё нет (создаёт её с role = admin).
--
-- ВАЖНО: после выполнения ВЫЙДИТЕ из аккаунта и войдите снова —
-- роль попадёт в новый токен (JWT), и админ-панель откроется надёжно.

-- 1) Профиль с ролью admin (нужен для RLS — записи товаров и смены статусов).
insert into public.profiles (id, role)
select id, 'admin'
from auth.users
where email = 'ВАШ_EMAIL@example.com'   -- <-- укажите свой email
on conflict (id) do update set role = 'admin';

-- 2) Роль в JWT (app_metadata) — по ней приложение проверяет доступ к /admin
--    без лишнего запроса к базе.
update auth.users
set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where email = 'ВАШ_EMAIL@example.com';   -- <-- тот же email

-- Проверка: role = admin в обоих местах
select u.email,
       u.raw_app_meta_data ->> 'role' as jwt_role,
       p.role                          as profile_role
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'ВАШ_EMAIL@example.com';   -- <-- тот же email
