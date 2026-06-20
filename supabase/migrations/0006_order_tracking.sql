-- Трек-номер отправления (Почта России / Ozon) для отслеживания заказа.
alter table public.orders
  add column if not exists tracking_number text;
