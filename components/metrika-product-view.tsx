"use client";

import { useEffect } from "react";
import { pushEcommerce } from "@/lib/metrika";
import type { Product } from "@/lib/types";

// Просмотр карточки товара в электронной коммерции Метрики (действие detail).
// Без него в отчёте «Товары» есть покупки, но нет знаменателя — сколько раз
// сорт смотрели, — и конверсию карточки посчитать не из чего.
//
// Страница товара серверная, а слой данных живёт в браузере: отсюда отдельный
// клиентский компонент на одну строчку эффекта.
export default function MetrikaProductView({ product }: { product: Product }) {
  const { id, name, price } = product;
  const category = product.category?.name;

  useEffect(() => {
    pushEcommerce("detail", [{ id, name, price, category }]);
  }, [id, name, price, category]);

  return null;
}
