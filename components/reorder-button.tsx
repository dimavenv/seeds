"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store-provider";
import { CartIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

// Кнопка «Заказать ещё раз»: складывает товары заказа обратно в корзину.
export default function ReorderButton({
  items,
}: {
  items: { product: Product; qty: number }[];
}) {
  const { addToCart } = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (items.length === 0) return null;

  function reorder() {
    setBusy(true);
    for (const { product, qty } of items) addToCart(product, qty);
    router.push("/cart");
  }

  return (
    <button onClick={reorder} disabled={busy} className="btn-accent w-full sm:w-auto">
      <CartIcon className="h-5 w-5" />
      {busy ? "Добавляем…" : "Заказать ещё раз"}
    </button>
  );
}
