"use client";

import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/components/store-provider";
import { HeartIcon, CartIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart, toggleWish, isWished, ready } = useStore();
  const wished = ready && isWished(product.id);

  return (
    <div className="card group flex flex-col overflow-hidden transition hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-brand-50">
        <Link href={`/product/${product.slug}`}>
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-brand-300">
              нет фото
            </div>
          )}
        </Link>
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.is_new && (
            <span className="badge bg-brand-500 text-white">Новинка</span>
          )}
          {product.is_featured && (
            <span className="badge bg-accent-500 text-white">Хит</span>
          )}
        </div>
        <button
          onClick={() => toggleWish(product.id)}
          aria-label="В избранное"
          className={`absolute right-2 top-2 rounded-full p-2 shadow-sm transition ${
            wished ? "bg-accent-500 text-white" : "bg-white/90 text-brand-600 hover:bg-white"
          }`}
        >
          <HeartIcon className="h-4 w-4" filled={wished} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        {product.category?.name && (
          <span className="text-xs text-brand-400">{product.category.name}</span>
        )}
        <Link
          href={`/product/${product.slug}`}
          className="mt-0.5 line-clamp-2 text-sm font-semibold text-brand-800 hover:text-brand-600"
        >
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-lg font-extrabold text-brand-700">
            {formatPrice(product.price)}
          </span>
          <button
            onClick={() => addToCart(product)}
            className="btn-accent !px-3 !py-2"
            aria-label="В корзину"
          >
            <CartIcon className="h-4 w-4" />
            <span className="hidden sm:inline">В корзину</span>
          </button>
        </div>
      </div>
    </div>
  );
}
