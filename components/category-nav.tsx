"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import CategoryIcon from "@/components/category-icon";
import { ChevronIcon, LeafIcon } from "@/components/icons";

// Лента категорий каталога: «Все семена» + категории с иконками.
//
// Листается кнопками по краям, колесом мыши, свайпом и с клавиатуры.
// Системную полосу прокрутки под лентой прячем (.no-scrollbar): категорий
// немного, лента вылезает за экран всего на пару чипов, и полоса под ней
// ездила на считаные миллиметры — выглядело как брак. О том, что есть куда
// листать, теперь говорят стрелки и градиент у края: они появляются ровно с
// той стороны, куда ещё можно прокрутить.

// На сколько листать за один клик — доля видимой ширины. Не весь экран:
// так на границе всегда остаётся один общий чип и не теряется контекст.
const PAGE_FRACTION = 0.8;

export default function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // 2px допуск: дробные размеры после масштабирования не дают scrollLeft
    // дойти ровно до максимума, и стрелка «вправо» иначе не гасла бы никогда.
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    // Ширина ленты меняется при повороте телефона и смене размера окна.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, categories.length]);

  // Активную категорию подтягиваем в видимую часть: при заходе на
  // /catalog/arbuz чип «Арбуз» иначе остался бы за краем экрана.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !activeSlug) return;
    const chip = el.querySelector<HTMLElement>(`[data-slug="${activeSlug}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeSlug]);

  function scrollBy(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * PAGE_FRACTION,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  const chip = (active: boolean) =>
    // pl-2 при pr-4: у иконки есть свои поля внутри картинки, поэтому слева
    // отступ меньше — иначе чип выглядит перекошенным.
    `inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-2 pr-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
      active
        ? "bg-brand-600 text-white shadow-sm"
        : "bg-brand-50 text-brand-700 hover:bg-brand-100"
    }`;

  return (
    <div className="relative mb-5">
      <div
        ref={trackRef}
        // snap-x + scroll-px: чип не «зависает» наполовину срезанным у края.
        className="no-scrollbar -mx-1 flex snap-x scroll-px-1 gap-2 overflow-x-auto px-1 py-1"
      >
        <Link href="/catalog" className={chip(!activeSlug)}>
          <LeafIcon className="h-5 w-5 shrink-0" />
          Все семена
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            data-slug={c.slug}
            href={`/catalog/${c.slug}`}
            className={chip(activeSlug === c.slug)}
          >
            <CategoryIcon slug={c.slug} className="h-7 w-7" />
            {c.name}
          </Link>
        ))}
      </div>

      <EdgeControl side="left" hidden={atStart} onClick={() => scrollBy(-1)} />
      <EdgeControl side="right" hidden={atEnd} onClick={() => scrollBy(1)} />
    </div>
  );
}

// Кнопка со стороны экрана + растушёвка под ней, чтобы чипы «уходили» под
// край, а не обрывались. Когда листать в эту сторону некуда — исчезает.
function EdgeControl({
  side,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  hidden: boolean;
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <div
      // pointer-events-none у обёртки: градиент не должен перехватывать клики
      // по чипам под ним, кликается только сама кнопка.
      className={`pointer-events-none absolute inset-y-0 z-10 flex items-center transition-opacity duration-200 ${
        isLeft ? "left-0 pr-8" : "right-0 pl-8"
      } ${hidden ? "opacity-0" : "opacity-100"}`}
      aria-hidden={hidden}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 w-16 ${
          isLeft
            ? "left-0 bg-gradient-to-r from-brand-50 to-transparent"
            : "right-0 bg-gradient-to-l from-brand-50 to-transparent"
        }`}
      />
      <button
        type="button"
        onClick={onClick}
        tabIndex={hidden ? -1 : undefined}
        aria-label={isLeft ? "Предыдущие категории" : "Следующие категории"}
        className={`pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-brand-100 bg-surface text-brand-700 shadow-sm transition hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-95 ${
          hidden ? "invisible" : ""
        }`}
      >
        <ChevronIcon direction={side} className="h-4 w-4" />
      </button>
    </div>
  );
}
