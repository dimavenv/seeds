"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import CategoryIcon from "@/components/category-icon";
import { ChevronIcon, LeafIcon } from "@/components/icons";
import ScrollIndicator from "@/components/scroll-indicator";

// Лента категорий каталога: «Все семена» + категории с иконками.
//
// На телефоне листается как обычно — пальцем, под лентой виден собственный
// индикатор прокрутки (ScrollIndicator): системную полосу на телефонах браузер
// рисует наложенной и не даёт перекрасить. Кнопки со стрелками там не
// показываем: пальцем удобнее, а мелкие кнопки у края только мешают.
//
// На десктопе к свайпу и колесу добавляются стрелки по краям — мышью тянуть
// горизонтальную полосу неудобно. Появляются они только с той стороны, куда
// действительно можно прокрутить.

// На сколько листать за один клик — доля видимой ширины. Не весь экран:
// так на границе всегда остаётся один общий чип и не теряется контекст.
const PAGE_FRACTION = 0.8;

// Если листать осталось меньше этого, кнопки не показываем вовсе. Когда лента
// вылезает за экран на десяток пикселей, стрелка сдвигает ленту на волосок —
// выглядит как неисправность. Проще не предлагать её вообще: такой хвост видно
// и так, а дотянуться до него можно колесом или пальцем.
const MIN_SCROLLABLE_PX = 48;

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
  const [scrollable, setScrollable] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // 2px допуск: дробные размеры после масштабирования не дают scrollLeft
    // дойти ровно до максимума, и стрелка «вправо» иначе не гасла бы никогда.
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max >= MIN_SCROLLABLE_PX);
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
    // pl-2 при pr-3: у иконки внутри картинки есть своё поле (иконки приведены
    // к общему виду скриптом scripts/normalize-category-icons.mjs), поэтому
    // слева отступ меньше — иначе чип выглядит перекошенным.
    //
    // Отступы именно такие, а не меньше: чип — круглая «пилюля» радиусом в
    // половину высоты, и у верхнего края граница уже заметно ушла внутрь. При
    // прежних 6/10px хвостик буквы «й» в «Перце сладком» и верх иконки
    // оказывались вплотную к этому изгибу и выглядели вылезшими за чип.
    // Место под них взято из промежутков (gap-1 вместо gap-1.5 и здесь, и
    // между чипами): строка из девяти чипов и так занимает контейнер целиком,
    // свободного места в ней меньше 20px — проверено измерением.
    //
    // На телефоне чипы держат свою ширину и лента листается (shrink-0).
    // На десктопе они делят строку поровну (sm:flex-1) и занимают её от края
    // до края — иначе восемь коротких названий жались к левому краю, а справа
    // оставалась пустота.
    // Рамка есть в обоих состояниях: без неё выбранный чип был бы на 2px
    // крупнее остальных и строка бы дёргалась при переключении.
    `inline-flex shrink-0 snap-start items-center justify-center gap-1 whitespace-nowrap rounded-full border py-1 pl-2 pr-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:flex-1 sm:py-2 sm:text-sm ${
      active
        ? "border-brand-600 bg-brand-600 text-white shadow-sm"
        : // bg-surface, а НЕ bg-brand-50: brand-50 — это и есть фон страницы,
          // поэтому невыбранные чипы были невидимы, а выбранный висел в
          // пустоте зелёным пятном. Теперь строка читается как набор кнопок.
          "border-brand-100 bg-surface text-brand-700 hover:border-brand-200 hover:bg-brand-100"
    }`;

  return (
    <div className="relative mb-5">
      <div
        ref={trackRef}
        // snap-x + scroll-px: чип не «зависает» наполовину срезанным у края.
        className="scrollbar-none -mx-1 flex snap-x scroll-px-1 gap-1 overflow-x-auto px-1 py-1"
      >
        <Link href="/catalog" className={chip(!activeSlug)}>
          <LeafIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
          Все семена
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            data-slug={c.slug}
            href={`/catalog/${c.slug}`}
            className={chip(activeSlug === c.slug)}
          >
            <CategoryIcon slug={c.slug} className="h-5 w-5 sm:h-6 sm:w-6" />
            {c.name}
          </Link>
        ))}
      </div>

      <ScrollIndicator targetRef={trackRef} className="mt-1.5 bg-brand-200/50" />

      <EdgeControl
        side="left"
        hidden={!scrollable || atStart}
        onClick={() => scrollBy(-1)}
      />
      <EdgeControl
        side="right"
        hidden={!scrollable || atEnd}
        onClick={() => scrollBy(1)}
      />
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
      className={`pointer-events-none absolute inset-y-0 z-10 hidden items-center transition-opacity duration-200 sm:flex ${
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
