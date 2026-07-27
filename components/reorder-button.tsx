"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store-provider";
import AddToCartButton from "@/components/add-to-cart-button";
import type { Product } from "@/lib/types";

// Кнопка «Заказать ещё раз»: складывает товары заказа обратно в корзину и
// ведёт в неё. Использует общую кнопку добавления — короткая вспышка
// «Добавлено ✓» перед переходом, как у остальных кнопок «В корзину».
export default function ReorderButton({
  items,
}: {
  items: { product: Product; qty: number }[];
}) {
  const { addToCart } = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (items.length === 0) return null;

  return (
    <AddToCartButton
      label="Заказать ещё раз"
      className="w-full sm:w-auto"
      disabled={busy}
      onAdd={() => {
        if (busy) return;
        setBusy(true);
        for (const { product, qty } of items) addToCart(product, qty);
        // Небольшая пауза, чтобы успех был виден, — затем в корзину.
        setTimeout(() => router.push("/cart"), 600);
      }}
    />
  );
}
