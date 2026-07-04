-- Атомарная проверка наличия и списание остатков при оформлении заказа.
-- Вызывается из /api/checkout сервисным ключом ПЕРЕД созданием заказа.
--
-- Принимает jsonb-массив вида [{"id": 1, "qty": 2}, ...].
-- Если какого-то товара не хватает — возвращает строки (id, available)
-- по товарам с нехваткой и НИЧЕГО не списывает.
-- Если хватает всего — списывает остатки и возвращает пустой результат.
--
-- Отрицательный qty допустим и означает возврат остатка (компенсация,
-- если заказ не удалось создать после списания).

create or replace function public.checkout_decrement_stock(p_items jsonb)
returns table(id bigint, available int)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Блокируем строки товаров (for update) и ищем нехватку.
  return query
  with req as (
    select (e->>'id')::bigint as pid, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e
  ),
  locked as (
    select p.id as pid, p.stock, r.qty
    from public.products p
    join req r on r.pid = p.id
    for update of p
  )
  select l.pid, l.stock from locked l where l.stock < l.qty;

  if found then
    return; -- нехватка: ничего не списываем
  end if;

  update public.products p
  set stock = greatest(p.stock - r.qty, 0)
  from (
    select (e->>'id')::bigint as pid, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e
  ) r
  where p.id = r.pid;
end;
$$;

-- Функцию вызывает только сервисный ключ; публичным ролям она не нужна.
revoke execute on function public.checkout_decrement_stock(jsonb)
  from public, anon, authenticated;
grant execute on function public.checkout_decrement_stock(jsonb)
  to service_role;
