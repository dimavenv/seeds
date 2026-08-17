"use client";

import Link from "next/link";
import ProductImage from "@/components/product-image";
import { variantsFor } from "@/lib/image-variants";
import { useStore } from "@/components/store-provider";
import { HeartIcon } from "@/components/icons";
import AddToCartButton from "@/components/add-to-cart-button";
import { formatPrice, seedsLabel } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart, toggleWish, isWished, ready } = useStore();
  const wished = ready && isWished(product.id);

  return (
    <div className="card group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-md motion-safe:animate-fade-up">
      <div className="relative aspect-square overflow-hidden bg-brand-50">
        <Link href={`/product/${product.slug}`}>
          {product.image_url ? (
            <ProductImage
              src={product.image_url}
              alt={`Семена ${product.name}`}
              variants={variantsFor(product.image_variants, product.image_url)}
              sizes="(max-width: 768px) 50vw, 25vw"
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
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
        {/* Кнопка-переключатель: без aria-pressed скринридер каждый раз читает
            «в избранное» и не говорит, добавлен товар или нет. */}
        <button
          type="button"
          onClick={() => toggleWish(product.id)}
          aria-pressed={wished}
          aria-label={
            wished
              ? `Убрать «${product.name}» из избранного`
              : `Добавить «${product.name}» в избранное`
          }
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
        {product.seeds_per_pack ? (
          <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
            🌱 {seedsLabel(product.seeds_per_pack)} в пакетике
          </span>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-lg font-extrabold text-brand-700">
            {formatPrice(product.price)}
          </span>
          {product.stock > 0 ? (
            <AddToCartButton
              onAdd={() => addToCart(product)}
              className="!px-3 !py-2"
              iconClassName="h-4 w-4"
              hideLabelOnMobile
            />
          ) : (
            <span className="rounded-full bg-brand-100 px-3 py-2 text-xs font-semibold text-brand-400">
              Нет в наличии
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
