"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store-provider";
import { CartIcon, CheckIcon, HeartIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

export default function AddToCart({ product }: { product: Product }) {
  const { addToCart, toggleWish, isWished, ready } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const wished = ready && isWished(product.id);
  const inStock = product.stock > 0;

  // Таймер «Добавлено ✓» гасим при размонтировании, чтобы не дёргать setState
  // на снятом компоненте.
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {inStock && (
          <div className="flex items-center rounded-full border border-brand-200 bg-surface">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="px-4 py-2 text-lg text-brand-600 disabled:opacity-40"
              aria-label="Меньше"
            >
              −
            </button>
            <span className="w-10 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
              disabled={qty >= product.stock}
              className="px-4 py-2 text-lg text-brand-600 disabled:opacity-40"
              aria-label="Больше"
              title={qty >= product.stock ? "Больше нет в наличии" : undefined}
            >
              +
            </button>
          </div>
        )}
        {inStock ? (
          <button
            onClick={() => {
              addToCart(product, qty);
              setAdded(true);
              if (addedTimer.current) clearTimeout(addedTimer.current);
              addedTimer.current = setTimeout(() => setAdded(false), 1500);
            }}
            className={`btn flex-1 text-white ${
              added
                ? "bg-brand-500 hover:bg-brand-600"
                : "bg-accent-500 hover:bg-accent-600"
            }`}
          >
            {added ? (
              <CheckIcon className="h-5 w-5 motion-safe:animate-pop-in" />
            ) : (
              <CartIcon className="h-5 w-5" />
            )}
            {added ? "Добавлено!" : "В корзину"}
          </button>
        ) : (
          <span className="flex flex-1 items-center justify-center rounded-full bg-brand-100 px-4 py-3 font-semibold text-brand-400">
            Нет в наличии
          </span>
        )}
        <button
          onClick={() => toggleWish(product.id)}
          aria-label="В избранное"
          className={`btn !px-3 ${
            wished
              ? "bg-accent-500 text-white"
              : "border border-brand-200 bg-surface text-brand-600"
          }`}
        >
          <HeartIcon className="h-5 w-5" filled={wished} />
        </button>
      </div>
      {inStock ? (
        <span className="text-sm text-brand-600">В наличии: {product.stock} шт.</span>
      ) : (
        <span className="text-sm text-accent-600">
          Этого сорта сейчас нет в наличии. Загляните позже или добавьте в
          избранное.
        </span>
      )}
    </div>
  );
}
