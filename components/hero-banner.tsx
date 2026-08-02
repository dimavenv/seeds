"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { LeafIcon } from "@/components/icons";
import type { Banner } from "@/lib/banners";

// Карусель баннеров главной. Список картинок приходит с сервера
// (lib/banners.ts читает public/banners при рендере страницы) — браузер больше
// не пробует по одному ~12 кандидатов на каждый визит. Если файлов нет —
// показывается запасной зелёный баннер с текстом.
//
// ===== Размер и пропорции =====
//
// Рамка баннера ПОСТОЯННАЯ: её размеры зависят только от ширины экрана
// (класс .hero-banner в app/globals.css), а не от пропорций текущего файла.
// Картинки заполняют её целиком (object-cover), лишнее обрезается по краям.
//
// Так сделано намеренно. Раньше блок принимал пропорции каждого кадра, чтобы
// ничего не обрезать, — но у загруженных баннеров соотношение сторон разное
// (1,7:1 … 2,2:1), и на каждой смене слайда высота с шириной прыгали, дёргая
// вместе с собой всю страницу. Спокойная рамка важнее пары сантиметров кадра;
// чтобы не терять важное, держите сюжет баннера ближе к центру, а пропорции
// файлов — около 2:1.

// Листаем чаще прежних 5 секунд: баннеров дюжина, и при медленной смене
// посетитель успевает увидеть от силы пару штук.
const AUTOPLAY_MS = 3500;

export default function HeroBanner({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  // Пауза автопрокрутки, пока пользователь читает баннер: наведён курсор или
  // фокус стоит на одной из кнопок (клавиатурная навигация).
  const [paused, setPaused] = useState(false);

  const count = banners.length;
  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count]
  );

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  // Стрелки клавиатуры листают карусель, когда фокус внутри неё. Слушаем на
  // самой секции, а не на window: иначе стрелки перехватывались бы на всей
  // странице и мешали обычной прокрутке.
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (count <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  }

  if (count === 0) return <FallbackHero />;

  const current = index % count;

  return (
    <section
      // Размеры рамки — целиком из CSS (.hero-banner): одинаковые для всех
      // слайдов. Баннер по центру и уже сетки товаров — читается как
      // отдельный блок.
      className="hero-banner group relative mx-auto w-full overflow-hidden rounded-2xl bg-brand-50 sm:rounded-3xl"
      aria-roledescription="карусель"
      aria-label="Акции и предложения"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div className="hero-banner-frame relative w-full">
        {banners.map(({ src, width, height }, i) => (
          <Link
            key={src}
            href="/catalog"
            aria-label="Перейти в каталог"
            aria-hidden={i !== current}
            // Скрытые слайды убираем из порядка обхода Tab: иначе фокус
            // уходил бы на невидимые ссылки.
            tabIndex={i === current ? undefined : -1}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Первый баннер грузим приоритетно: это самый крупный элемент
                первого экрана, от него напрямую зависит LCP. Остальные —
                лениво, они всё равно показываются не сразу. */}
            {/* alt пустой намеренно: баннер — оформление, его смысл несёт
                aria-label ссылки. Содержимое файла из public/banners коду
                неизвестно, а подставлять во все баннеры одну и ту же строку с
                ключевыми словами — ровно то переспамливание alt, за которое
                Яндекс понижает страницу. Описательные alt с названием сорта
                стоят там, где они правдивы, — на фото товаров. */}
            <Image
              src={src}
              alt=""
              width={width}
              height={height}
              // Ширины на ступенях: телефон — вся ширина экрана, дальше блок
              // ограничен высотой, и самый крупный вариант нужен примерно под
              // 1500px (широкий монитор, кадр 2.2:1).
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 92vw, (max-width: 1536px) 80vw, 1500px"
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              // object-cover: кадр заполняет постоянную рамку без полей,
              // лишнее обрезается симметрично от центра.
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 sm:bottom-3">
          {/* Точки: показывают, сколько всего баннеров и где мы сейчас, и
              переключают слайд. Стрелок по краям нет намеренно — они лезли
              под палец поверх самой картинки; листать можно точками, а с
              клавиатуры — стрелками (см. onKeyDown выше). */}
          <div className="flex gap-2">
            {banners.map(({ src }, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Баннер ${i + 1}`}
                aria-current={i === current}
                className={`h-2.5 rounded-full shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-black/20 ${
                  i === current
                    ? "w-6 bg-white"
                    : "w-2.5 bg-white/60 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FallbackHero() {
  return (
    <section className="hero-banner mx-auto w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white sm:rounded-3xl sm:p-10">
      <div className="max-w-2xl">
        <span className="badge bg-white/15 text-white">
          <LeafIcon className="mr-1 h-4 w-4" /> Сезон посадки открыт
        </span>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-4xl">
          Семена для богатого урожая
        </h1>
        <p className="mt-3 text-base text-brand-50/90 sm:text-lg">
          Проверенные сорта с доставкой почтой по всей России.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/catalog" className="btn-accent">
            Перейти в каталог
          </Link>
        </div>
      </div>
    </section>
  );
}
