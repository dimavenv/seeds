"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/components/store-provider";

// Серверная страница монтирует компонент только после проверки счёта и статуса
// заказа в БД. Вычитаем позиции заказа; при отмене/ошибке компонент не попадёт
// в HTML и корзина останется нетронутой.
export default function ClearCartOnPaid({
  items,
  paymentId,
}: {
  items: { id: string; qty: number }[];
  paymentId: string;
}) {
  const { removePurchasedFromCart, clearPromo, ready } = useStore();
  const applied = useRef(false);
  useEffect(() => {
    // Дождаться загрузки localStorage: дочерний эффект может выполниться до
    // эффекта провайдера, иначе очистится пустой начальный снимок.
    if (!ready || applied.current) return;
    const marker = `sc_cart_cleared_payment_${paymentId}`;
    try {
      if (localStorage.getItem(marker) === "1") return;
    } catch {}
    applied.current = true;
    removePurchasedFromCart(items);
    clearPromo();
    try {
      localStorage.setItem(marker, "1");
    } catch {}
  }, [ready, items, paymentId, removePurchasedFromCart, clearPromo]);
  return null;
}
