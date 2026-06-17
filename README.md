# 🌱 Semena Collection

Интернет-магазин семян в стиле садового центра **LETTO**: каталог по категориям,
поиск/фильтры/сортировка, корзина, избранное, оформление заказа и админ-панель.

Стек: **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase**
(Postgres, Auth, Storage). Язык интерфейса — русский, валюта — ₽.

## Возможности

- **Витрина:** главная с баннером, категориями, блоками «Хиты» и «Новинки».
- **Каталог:** категории (Томаты, Перец сладкий, Перец чили, Баклажаны, Кукуруза,
  Картофель, Дыня, Арбуз), поиск по названию, фильтр по цене, сортировка.
- **Инфо-страницы:** «О нас», «Доставка», «Оплата», «Как заказать» (ссылки в шапке).
- **Карточка товара** с похожими товарами.
- **Корзина и избранное** — в `localStorage` (работают без регистрации).
- **Оформление заказа** (гостевой): заказ сохраняется в БД, без онлайн-оплаты
  (оплата при получении / по счёту). Итог считается на сервере по ценам из БД.
- **Аккаунты:** вход/регистрация через Supabase Auth (опционально для покупателей,
  обязательно для администратора).
- **Админка `/admin`:** CRUD товаров с загрузкой фото в Supabase Storage, список
  заказов со сменой статусов, дашборд.

> Без настроенного Supabase магазин работает в **демо-режиме** на встроенных
> данных (`lib/demo-data.ts`) — каталог, корзина и оформление доступны для
> просмотра. Админка и сохранение заказов требуют Supabase.

## Быстрый старт

```bash
npm install
cp .env.local.example .env.local   # заполните ключами Supabase (или оставьте пустым для демо)
npm run dev                        # http://localhost:3000
```

## Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com) (есть бесплатный тариф).
2. В **SQL Editor** выполните по очереди:
   - `supabase/migrations/0001_init.sql` — таблицы, RLS, триггеры, enum статусов;
   - `supabase/migrations/0002_storage.sql` — bucket `product-images` и политики;
   - `supabase/seed.sql` — демо-категории и товары (необязательно).
3. Скопируйте в `.env.local` (Project Settings → API):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # только сервер, не публиковать
   ```

   `SUPABASE_SERVICE_ROLE_KEY` используется серверным роутом оформления заказа
   (`app/api/checkout/route.ts`) для надёжной записи заказа в обход RLS.

### Создание администратора

1. Зарегистрируйтесь на `/register` (или создайте пользователя в Supabase →
   Authentication → Users). При регистрации профиль создаётся автоматически.
2. Назначьте роль `admin` в **SQL Editor**:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. Войдите на `/login` и откройте `/admin`.

> Для загрузки фото в админке отключите подтверждение email (Authentication →
> Providers → Email → «Confirm email» off) либо подтвердите почту администратора —
> загрузка в Storage требует активной сессии админа.

## Деплой на Vercel

1. Запушьте репозиторий и импортируйте его в [Vercel](https://vercel.com).
2. В **Environment Variables** добавьте три переменные из `.env.local`.
3. Deploy. Фреймворк (Next.js) определится автоматически.

## Структура

```
app/
  page.tsx                 # главная
  catalog/                 # каталог: /catalog и /catalog/[category]
  product/[slug]/          # карточка товара
  cart/  checkout/  order/[id]/   favorites/
  login/  register/
  admin/                   # дашборд, товары (CRUD), заказы + actions.ts
  api/                     # /api/products, /api/checkout
components/                # Header, Footer, ProductCard, фильтры, формы админки
lib/
  supabase/{client,server}.ts
  data.ts                  # выборка из Supabase с фолбэком на демо-данные
  demo-data.ts  types.ts  format.ts  auth.ts
supabase/
  migrations/*.sql  seed.sql
```

## Свои картинки (баннеры и категории)

Картинки можно загрузить прямо на GitHub — без программирования:

- **Баннеры главной:** папка `public/banners/`, файлы `1.jpg … 5.jpg`
  (широкие, ~1600px, пропорции 16:6). Прокручиваются каруселью. Нет файлов —
  показывается запасной зелёный баннер.
- **Картинки категорий:** папка `public/categories/`, имена по категории:
  `tomaty.jpg`, `perec-sladkiy.jpg`, `perec-chili.jpg`, `baklazhany.jpg`,
  `kukuruza.jpg`, `kartofel.jpg`, `dynya.jpg`, `arbuz.jpg` (квадрат ~400px).
  Нет файла — показывается эмодзи.

Как загрузить: на github.com откройте нужную папку → **Add file → Upload files** →
перетащите картинки с правильными именами → **Commit**. Подробности — в
`README.txt` внутри каждой папки.

## Управление каталогом

Реальные товары (фото и названия с вашего магазина на Ozon) добавляйте через
**`/admin/products`** — каждый товар с фото, ценой, категорией, остатком и
отметками «Новинка»/«Хит». Демо-товары можно удалить там же.
