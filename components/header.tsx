"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store-provider";
import Logo from "@/components/logo";
import SearchBox from "@/components/search-box";
import {
  CartIcon,
  CloseIcon,
  HeartIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";

export default function Header() {
  const { cartCount, wishlist, ready } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

  // Блокируем прокрутку страницы, пока открыт мобильный поиск.
  useEffect(() => {
    document.body.style.overflow = searchOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [searchOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-surface/95 backdrop-blur">
      <div className="container-page flex items-center gap-3 py-3 sm:gap-5 sm:py-4">
        <Link
          href="/"
          className="flex shrink-0 items-center text-brand-600"
          aria-label="Tomat Semena — на главную"
        >
          <Logo className="h-9 w-auto max-w-[170px] sm:h-11 sm:max-w-[220px]" />
        </Link>

        {/* Десктоп: поиск с подсказками */}
        <SearchBox className="ml-2 hidden flex-1 md:block" />

        <nav className="ml-auto flex items-center gap-1 sm:gap-3">
          {/* Мобайл: кнопка-лупа открывает оверлей поиска */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск"
            className="rounded-full p-2 text-brand-700 hover:bg-brand-50 md:hidden"
          >
            <SearchIcon className="h-6 w-6" />
          </button>

          <Link href="/favorites" className="relative rounded-full p-2 text-brand-700 hover:bg-brand-50 sm:p-2.5" aria-label="Избранное">
            <HeartIcon className="h-6 w-6" />
            {ready && wishlist.length > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link href="/cart" className="relative rounded-full p-2 text-brand-700 hover:bg-brand-50 sm:p-2.5" aria-label="Корзина">
            <CartIcon className="h-6 w-6" />
            {ready && cartCount > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/account" className="rounded-full p-2 text-brand-700 hover:bg-brand-50 sm:p-2.5" aria-label="Личный кабинет">
            <UserIcon className="h-6 w-6" />
          </Link>
        </nav>
      </div>

      <div className="bg-brand-600 shadow-sm">
        <div className="container-page flex items-center gap-1 overflow-x-auto py-2 text-base sm:justify-between">
          <Link href="/catalog" className="whitespace-nowrap rounded-full px-4 py-2 font-bold text-white hover:bg-white/15">
            Каталог
          </Link>
          <Link href="/about" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            О нас
          </Link>
          <Link href="/delivery" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Доставка и оплата
          </Link>
          <Link href="/how-to-order" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Как заказать
          </Link>
          <Link href="/reviews" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Отзывы
          </Link>
          <Link href="/support" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Поддержка
          </Link>
        </div>
      </div>

      {/* Мобильный оверлей поиска: затемнение + окно сверху */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSearchOpen(false)}
          />
          <div className="relative mx-auto max-w-2xl bg-surface p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchBox autoFocus onNavigate={() => setSearchOpen(false)} />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Закрыть"
                className="rounded-full p-2 text-brand-700 hover:bg-brand-50"
              >
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
