"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Category } from "@/lib/types";
import CategoryIcon from "@/components/category-icon";
import { LeafIcon } from "@/components/icons";
import ScrollIndicator from "@/components/scroll-indicator";

// Лента категорий каталога: «Все семена» + категории с иконками.
//
// На телефоне это одна лента, которую листают пальцем; под ней виден
// собственный индикатор прокрутки (ScrollIndicator): системную полосу на
// телефонах браузер рисует наложенной и не даёт перекрасить.
//
// На десктопе прокрутки нет вовсе: девять чипов помещаются в одну строку
// целиком, а если места всё же не хватит (узкое окно, крупный шрифт, новая
// категория) — переносятся на вторую. Стрелок по краям тут больше нет: листать
// нечего, а на телефоне они и раньше не показывались (пальцем удобнее, мелкие
// кнопки у края мешают).

export default function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Активную категорию подтягиваем в видимую часть: на телефоне при заходе на
  // /catalog/arbuz чип «Арбуз» иначе остался бы за краем экрана. На десктопе,
  // где лента перенесена по строкам, прокручивать нечего и вызов ничего не
  // делает.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !activeSlug) return;
    const chip = el.querySelector<HTMLElement>(`[data-slug="${activeSlug}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeSlug]);

  const chip = (active: boolean) =>
    // Отступ слева на полшага меньше правого: у иконки внутри картинки есть
    // своё поле (иконки приведены к общему виду скриптом
    // scripts/normalize-category-icons.mjs), и при равных числах чип выглядит
    // перекошенным.
    //
    // Отступы не меньше этих: чип — круглая «пилюля» радиусом в половину
    // высоты, у верхнего края граница заметно уходит внутрь. При прежних
    // 6/10px хвостик буквы «й» в «Перце сладком» и верх иконки оказывались
    // вплотную к этому изгибу и выглядели вылезшими за чип.
    //
    // Ширина у чипа своя, по содержимому, и на телефоне, и на десктопе.
    // Растягивать их на равную долю строки (flex-1) нельзя: девять названий
    // разной длины помещаются в контейнер ровно впритык, и равная доля
    // означала, что «Арбузу» достаётся вагон пустоты, а «Перцу сладкому» —
    // ничего сверх минимума. Одинаковые поля у всех читаются ровнее.
    //
    // Рамка есть в обоих состояниях: без неё выбранный чип был бы на 2px
    // крупнее остальных и строка бы дёргалась при переключении.
    `inline-flex shrink-0 snap-start items-center justify-center gap-1 whitespace-nowrap rounded-full border py-1 pl-2 pr-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:py-2 sm:pl-2.5 sm:text-sm ${
      active
        ? "border-brand-600 bg-brand-600 text-white shadow-sm"
        : // bg-surface, а НЕ bg-brand-50: brand-50 — это и есть фон страницы,
          // поэтому невыбранные чипы были невидимы, а выбранный висел в
          // пустоте зелёным пятном. Теперь строка читается как набор кнопок.
          "border-brand-100 bg-surface text-brand-700 hover:border-brand-200 hover:bg-brand-100"
    }`;

  return (
    <div className="mb-5">
      <div
        ref={trackRef}
        // На телефоне — лента, которую листают пальцем; snap-x + scroll-px не
        // дают чипу зависнуть наполовину срезанным у края.
        //
        // От sm вместо прокрутки перенос по строкам. На широком экране всё
        // помещается в одну: девять чипов занимают ~1120px при контейнере
        // 1216px. Запас невелик, и держится он на ширине шрифта, а она у всех
        // разная — здесь замерено на DejaVu Sans, самом широком из доступных;
        // у Segoe UI и SF Pro, которые реально достаются посетителю, те же
        // надписи короче на 15%.
        // Если запаса всё же не хватит (крупный шрифт, новая категория), лента
        // не обрежется и не поедет вбок, а перенесётся на вторую строку.
        className="scrollbar-none -mx-1 flex snap-x scroll-px-1 gap-1 overflow-x-auto px-1 py-1 sm:flex-wrap sm:justify-center sm:gap-1.5"
      >
        <Link href="/catalog" className={chip(!activeSlug)}>
          <LeafIcon className="h-4 w-4 shrink-0" />
          Все семена
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            data-slug={c.slug}
            href={`/catalog/${c.slug}`}
            className={chip(activeSlug === c.slug)}
          >
            {/* На десктопе значок меньше, чем на телефоне: там лента листается
                и место не ограничено, а тут все девять чипов должны уместиться
                в одну строку. 16px — примерно размер эмодзи, которые стояли
                здесь до нарисованных иконок. */}
            <CategoryIcon slug={c.slug} className="h-5 w-5 sm:h-4 sm:w-4" />
            {c.name}
          </Link>
        ))}
      </div>

      {/* Индикатор сам прячется, когда прокручивать нечего, — на десктопе его
          не видно. */}
      <ScrollIndicator targetRef={trackRef} className="mt-1.5 bg-brand-200/50" />
    </div>
  );
}
