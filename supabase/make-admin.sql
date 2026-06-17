-- Назначить пользователя администратором.
-- Замените email на свой и выполните в Supabase → SQL Editor.
-- Работает, даже если строки профиля ещё нет (создаёт её с role = admin).

insert into public.profiles (id, role)
select id, 'admin'
from auth.users
where email = 'ВАШ_EMAIL@example.com'   -- <-- укажите свой email
on conflict (id) do update set role = 'admin';

-- Проверка: должна вернуться строка с role = admin
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'ВАШ_EMAIL@example.com';   -- <-- тот же email
