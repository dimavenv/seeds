-- Количество семян в одном пакетике (для карточки товара).
alter table public.products
  add column if not exists seeds_per_pack int;
