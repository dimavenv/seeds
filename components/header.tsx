"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/components/store-provider";
import Logo from "@/components/logo";
import {
  CartIcon,
  HeartIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";

export default function Header() {
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
      <div className="container-page flex items-center gap-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-brand-600">
          <Logo className="h-9 w-9" />
          <span className="text-2xl font-extrabold tracking-tight text-brand-700">
            Tomat<span className="text-accent-500">Semena</span>
          </span>
        </Link>

        <form onSubmit={onSearch} className="relative ml-2 hidden flex-1 md:block">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-6 w-6 -translate-y-1/2 text-brand-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: томат, перец, баклажан…"
            className="input pl-12 text-base md:py-3"
            aria-label="Поиск"
          />
        </form>

        <nav className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link href="/favorites" className="relative rounded-full p-2.5 text-brand-700 hover:bg-brand-50" aria-label="Избранное">
            <HeartIcon className="h-6 w-6" />
            {ready && wishlist.length > 0 && (
              <span className="absolute -right-0 -top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link href="/cart" className="relative rounded-full p-2.5 text-brand-700 hover:bg-brand-50" aria-label="Корзина">
            <CartIcon className="h-6 w-6" />
            {ready && cartCount > 0 && (
              <span className="absolute -right-0 -top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/account" className="rounded-full p-2.5 text-brand-700 hover:bg-brand-50" aria-label="Личный кабинет">
            <UserIcon className="h-6 w-6" />
          </Link>
        </nav>
      </div>

      <div className="bg-brand-600 shadow-sm">
        <div className="container-page flex items-center justify-between gap-1 overflow-x-auto py-2 text-base">
          <Link href="/catalog" className="whitespace-nowrap rounded-full px-4 py-2 font-bold text-white hover:bg-white/15">
            Каталог
          </Link>
          <Link href="/about" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            О нас
          </Link>
          <Link href="/delivery" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Доставка
          </Link>
          <Link href="/payment" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Оплата
          </Link>
          <Link href="/how-to-order" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Как заказать
          </Link>
          <Link href="/support" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Поддержка
          </Link>
        </div>
      </div>
    </header>
  );
}
