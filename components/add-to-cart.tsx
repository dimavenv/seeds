"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/components/store-provider";
import { CartIcon, HeartIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

export default function AddToCart({ product }: { product: Product }) {
  const { addToCart, toggleWish, isWished, ready, cart } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const wished = ready && isWished(product.id);
  const inStock = product.stock > 0;

  // Сколько уже лежит в корзине — добавить можно только остаток.
  const inCart = ready ? cart.find((i) => i.id === product.id)?.qty ?? 0 : 0;
  const available = Math.max(0, product.stock - inCart);

  // Если остаток уменьшился (добавили в корзину) — поджимаем степпер.
  useEffect(() => {
    if (available > 0) setQty((q) => Math.min(q, available));
  }, [available]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {inStock && available > 0 && (
          <div className="flex items-center rounded-full border border-brand-200 bg-surface">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-4 py-2 text-lg text-brand-600"
              aria-label="Меньше"
            >
              −
            </button>
            <span className="w-10 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(available, q + 1))}
              disabled={qty >= available}
              className="px-4 py-2 text-lg text-brand-600 disabled:opacity-40"
              aria-label="Больше"
            >
              +
            </button>
          </div>
        )}
        {inStock ? (
          available > 0 ? (
            <button
              onClick={() => {
                addToCart(product, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 1500);
              }}
              className="btn-accent flex-1"
            >
              <CartIcon className="h-5 w-5" />
              {added ? "Добавлено!" : "В корзину"}
            </button>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-full bg-brand-100 px-4 py-3 text-center font-semibold text-brand-500">
              Весь остаток уже в корзине
            </span>
          )
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
        <span className="text-sm text-brand-600">
          В наличии: {product.stock} шт.
          {inCart > 0 && ` · в корзине: ${inCart} шт.`}
        </span>
      ) : (
        <span className="text-sm text-accent-600">
          Этого сорта сейчас нет в наличии. Загляните позже или добавьте в
          избранное.
        </span>
      )}
    </div>
  );
}
