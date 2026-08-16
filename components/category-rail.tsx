"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CategoryIcon from "@/components/category-icon";
import { LeafIcon } from "@/components/icons";
import type { Category } from "@/lib/types";

// Категории сбоку — вторая, «догоняющая» навигация каталога.
//
// Лента чипов над заголовком (CategoryNav) остаётся главной, но она уезжает
// вверх после первого же экрана товаров: чтобы перейти в другой раздел с
// середины каталога, приходилось листать обратно наверх. Эта колонка
// появляется ровно тогда, когда лента скрылась из виду, и пропадает, когда
// покупатель к ней вернулся.
//
// Почему только на большом экране (от 1440px):
//   * колонка стоит в ПОЛЕ страницы, слева от контейнера (max-w-7xl = 1280px).
//     При 1440px по краям остаётся по 80px — узкой колонки в 56px с отступом
//     хватает, и она не наезжает на карточки. На меньшем экране поля нет, и
//     колонка перекрывала бы товары — то самое «мешает просмотру каталога»;
//   * на телефоне листают пальцем от края, и панель у левого края ловила бы
//     жесты вместо страницы.
// Разбираемся с этим одним медиазапросом (max-[1439px]:hidden), а не sm/md/lg:
// контрольная точка здесь — не «планшет или десктоп», а ширина поля вокруг
// контейнера.
//
// Названия показываем только под курсором: постоянные подписи потребовали бы
// колонку втрое шире, а она бы уже не поместилась в поле.

const ANCHOR_ID = "catalog-categories";

export default function CategoryRail({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  // Показываем колонку, только когда лента чипов ушла за верхний край.
  // IntersectionObserver, а не отслеживание window.scrollY: высота шапки и
  // блока с описанием категории разная, и порог «столько-то пикселей» на
  // одних страницах срабатывал бы раньше, чем лента скроется, а на других —
  // сильно позже.
  const [visible, setVisible] = useState(false);
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const anchor = document.getElementById(ANCHOR_ID);
    if (!anchor) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      // Небольшой отрицательный отступ сверху: под шапкой (sticky, ~72px)
      // лента формально ещё «видна», но закрыта ею — колонка должна появиться
      // уже тогда.
      { rootMargin: "-80px 0px 0px 0px" }
    );
    io.observe(anchor);
    return () => io.disconnect();
  }, []);

  // Активную категорию подтягиваем в видимую часть колонки: если категорий
  // станет больше, чем помещается по высоте, выбранная не должна оказаться за
  // краем прокрутки.
  useEffect(() => {
    const rail = railRef.current;
    if (!visible || !activeSlug || !rail) return;
    // Только если колонка сама прокручивается. Иначе scrollIntoView возьмётся
    // за ближайший прокручиваемый предок — саму страницу — и каталог дёрнется
    // в момент появления колонки.
    if (rail.scrollHeight <= rail.clientHeight) return;
    rail
      .querySelector<HTMLElement>(`[data-slug="${activeSlug}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [visible, activeSlug]);

  const items = [
    { slug: "", name: "Все семена", href: "/catalog" },
    ...categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      href: `/catalog/${c.slug}`,
    })),
  ];

  return (
    <nav
      ref={railRef}
      aria-label="Категории каталога"
      // aria-hidden в скрытом состоянии: ссылки продублированы лентой наверху,
      // и скринридеру незачем читать их дважды. inert недоступен в React 18,
      // поэтому от табуляции спасает pointer-events + tabIndex у ссылок.
      aria-hidden={!visible}
      className={`fixed left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-brand-100 bg-surface/95 p-1.5 shadow-lg backdrop-blur transition-[opacity,transform] duration-300 max-[1439px]:hidden ${
        visible
          ? "translate-x-0 opacity-100"
          : "pointer-events-none -translate-x-4 opacity-0"
      } max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-none`}
    >
      {items.map((item) => {
        const active = (activeSlug ?? "") === item.slug;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-slug={item.slug}
            tabIndex={visible ? undefined : -1}
            aria-current={active ? "page" : undefined}
            // group/peer здесь не нужны: подпись — прямой потомок ссылки,
            // достаточно group-hover от самой ссылки.
            className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-brand-700 hover:bg-brand-100"
            }`}
          >
            {item.slug ? (
              <CategoryIcon slug={item.slug} className="h-6 w-6" />
            ) : (
              <LeafIcon className="h-5 w-5" />
            )}
            {/* Подпись выезжает вправо, поверх поля страницы. Появляется
                только под курсором или при переходе табуляцией — то есть по
                действию покупателя, а не сама по себе поверх карточек. */}
            <span className="pointer-events-none absolute left-full ml-2 origin-left scale-95 whitespace-nowrap rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// Якорь, по которому колонка понимает, что лента чипов скрылась. Ставится
// вокруг CategoryNav — см. components/catalog-view.tsx.
export { ANCHOR_ID as CATEGORY_ANCHOR_ID };
