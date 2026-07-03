"use client";

import { useRef, useState } from "react";
import { useStore } from "@/components/store-provider";
import { CartIcon, CheckIcon, HeartIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

export default function AddToCart({ product }: { product: Product }) {
  const { addToCart, toggleWish, isWished, ready } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>();
  const [heartPulse, setHeartPulse] = useState(false);
  const wished = ready && isWished(product.id);
  const inStock = product.stock > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {inStock && (
          <div className="flex items-center rounded-full border border-brand-200 bg-surface">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-4 py-2 text-lg text-brand-600 transition-colors hover:text-brand-800 motion-safe:active:scale-90"
              aria-label="Меньше"
            >
              −
            </button>
            <span className="w-10 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="px-4 py-2 text-lg text-brand-600 transition-colors hover:text-brand-800 motion-safe:active:scale-90"
              aria-label="Больше"
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
              clearTimeout(addedTimer.current);
              addedTimer.current = setTimeout(() => setAdded(false), 1500);
            }}
            className={`${added ? "btn bg-brand-500 text-white hover:bg-brand-600" : "btn-accent"} min-w-[11rem] flex-1`}
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
          onClick={() => {
            toggleWish(product.id);
            setHeartPulse(true);
          }}
          aria-label={wished ? "Убрать из избранного" : "В избранное"}
          className={`btn !px-3 ${
            wished
              ? "bg-accent-500 text-white"
              : "border border-brand-200 bg-surface text-brand-600"
          }`}
        >
          <HeartIcon
            className={`h-5 w-5 ${heartPulse ? "motion-safe:animate-heart-beat" : ""}`}
            filled={wished}
            onAnimationEnd={() => setHeartPulse(false)}
          />
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
