"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store-provider";
import Logo from "@/components/logo";
import ScrollIndicator from "@/components/scroll-indicator";
import SearchBox from "@/components/search-box";
import {
  CartIcon,
  CloseIcon,
  HeartIcon,
  SearchIcon,
  UserIcon,
} from "@/components/icons";

// Общий стиль круглых кнопок-иконок шапки: заметное кольцо при фокусе
// с клавиатуры (мышиный клик кольца не рисует).
const ICON_BTN =
  "rounded-full p-2 text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

export default function Header() {
  const { cartCount, wishlist, ready } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Блокируем прокрутку страницы, пока открыт мобильный поиск; Escape закрывает.
  useEffect(() => {
    document.body.style.overflow = searchOpen ? "hidden" : "";
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
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
          <Logo className="h-[4.5rem] w-auto max-w-[320px] sm:h-20 sm:max-w-[400px]" />
        </Link>

        {/* Десктоп: поиск с подсказками */}
        <SearchBox className="ml-2 hidden flex-1 md:block" />

        <nav className="ml-auto flex items-center gap-1 sm:gap-3">
          {/* Мобайл: кнопка-лупа открывает оверлей поиска */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск"
            className={`${ICON_BTN} md:hidden`}
          >
            <SearchIcon className="h-6 w-6" />
          </button>

          <Link href="/favorites" className={`relative sm:p-2.5 ${ICON_BTN}`} aria-label="Избранное">
            <HeartIcon className="h-6 w-6" />
            {ready && wishlist.length > 0 && (
              // key по значению: при изменении счётчик перерисовывается и
              // «подпрыгивает» (pop-in) — заметная обратная связь на добавление.
              <span
                key={wishlist.length}
                className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white motion-safe:animate-pop-in"
              >
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link href="/cart" className={`relative sm:p-2.5 ${ICON_BTN}`} aria-label="Корзина">
            <CartIcon className="h-6 w-6" />
            {ready && cartCount > 0 && (
              <span
                key={cartCount}
                className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white motion-safe:animate-pop-in"
              >
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/account" className={`sm:p-2.5 ${ICON_BTN}`} aria-label="Личный кабинет">
            <UserIcon className="h-6 w-6" />
          </Link>
        </nav>
      </div>

      <div className="bg-brand-600 shadow-sm">
        <div className="container-page pb-1.5 pt-2">
          {/* Меню шире экрана на телефоне — листается пальцем, а под ним свой
              индикатор прокрутки: системную полосу на телефоне не перекрасить
              (браузер рисует её наложенной). */}
          <div
            ref={navRef}
            className="scrollbar-none flex items-center gap-1 overflow-x-auto text-base sm:justify-between"
          >
          <Link href="/catalog" className="whitespace-nowrap rounded-full px-4 py-2 font-bold text-white hover:bg-white/15">
            Каталог
          </Link>
          <Link href="/about" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            О нас
          </Link>
          <Link href="/delivery" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Доставка и оплата
          </Link>
          <Link href="/reviews" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Отзывы
          </Link>
          <Link href="/support" className="whitespace-nowrap rounded-full px-4 py-2 font-medium text-white/90 hover:bg-white/15 hover:text-white">
            Поддержка
          </Link>
          </div>
          {/* На тёмно-зелёной подложке зелёный ползунок не читается —
              берём белый. sm:hidden: на десктопе меню помещается целиком. */}
          <ScrollIndicator
            targetRef={navRef}
            className="mt-1.5 bg-white/20 sm:hidden"
            thumbClassName="bg-white/70 hover:bg-white active:bg-white"
          />
        </div>
      </div>

      {/* Мобильный оверлей поиска: затемнение + окно сверху.
          Закрывается по крестику, клику по затемнению и Escape. */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Поиск по каталогу"
        >
          <div
            className="absolute inset-0 bg-black/50 motion-safe:animate-fade-in"
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
                className={ICON_BTN}
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
