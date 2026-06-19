-- Tomat Semena — несколько фото на товар
-- Массив URL-ов изображений товара. image_url остаётся как главное (первое) фото
-- для обратной совместимости (карточки в каталоге, корзина).

alter table public.products
  add column if not exists images text[] not null default '{}';
