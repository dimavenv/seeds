"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import ProductGrid from "@/components/product-grid";
import { HeartIcon } from "@/components/icons";
import type { Product } from "@/lib/types";

export default function FavoritesPage() {
  const { wishlist, ready } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (wishlist.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/products?ids=${wishlist.join(",")}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, [wishlist, ready]);

  if (!ready || loading) {
    return <div className="container-page py-10 text-brand-500">Загрузка…</div>;
  }

  if (wishlist.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <HeartIcon className="mx-auto h-12 w-12 text-brand-300" />
        <h1 className="mt-4 text-2xl font-bold text-brand-800">
          В избранном пока пусто
        </h1>
        <p className="mt-2 text-brand-500">
          Нажимайте на сердечко у товара, чтобы сохранить понравившиеся сорта.
        </p>
        <Link href="/catalog" className="btn-primary mt-6">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <h1 className="mb-6 text-2xl font-bold text-brand-800">Избранное</h1>
      <ProductGrid products={products} />
    </div>
  );
}
