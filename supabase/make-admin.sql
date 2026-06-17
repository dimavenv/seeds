-- Назначить пользователя администратором.
-- Замените email на свой и выполните в Supabase → SQL Editor.

update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where email = 'ВАШ_EMAIL@example.com'   -- <-- укажите свой email
);

-- Проверка: должна вернуться строка с role = admin
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'ВАШ_EMAIL@example.com';   -- <-- тот же email
