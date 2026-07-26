"use client";

import { useEffect } from "react";
import { useStore } from "@/components/store-provider";

// Очистка корзины после успешной оплаты. Корзина не чистится перед уходом на
// платёжную форму (чтобы при неудачной оплате товары остались у покупателя),
// поэтому чистим при возвращении с ?paid=1.
export default function ClearCartOnPaid() {
  const { clearCart } = useStore();
  useEffect(() => {
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
