"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/components/store-provider";
import {
  CartIcon,
  HeartIcon,
  LeafIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";
import type { Category } from "@/lib/types";

export default function Header({ categories }: { categories: Category[] }) {
  const { cartCount, wishlist, ready } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="container-page flex items-center gap-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-brand-600">
          <LeafIcon className="h-7 w-7" />
          <span className="text-lg font-extrabold tracking-tight text-brand-700">
            Semena<span className="text-accent-500">Collection</span>
          </span>
        </Link>

        <form onSubmit={onSearch} className="relative ml-2 hidden flex-1 md:block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск семян: томат, базилик, петуния…"
            className="input pl-10"
            aria-label="Поиск"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/favorites" className="relative rounded-full p-2 text-brand-700 hover:bg-brand-50" aria-label="Избранное">
            <HeartIcon />
            {ready && wishlist.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link href="/cart" className="relative rounded-full p-2 text-brand-700 hover:bg-brand-50" aria-label="Корзина">
            <CartIcon />
            {ready && cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/login" className="rounded-full p-2 text-brand-700 hover:bg-brand-50" aria-label="Вход">
            <UserIcon />
          </Link>
        </nav>
      </div>

      <div className="border-t border-brand-100 bg-brand-50">
        <div className="container-page flex items-center gap-1 overflow-x-auto py-2 text-sm">
          <Link href="/catalog" className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-brand-700 hover:bg-white">
            Все семена
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-brand-700 hover:bg-white"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
