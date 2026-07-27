"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronIcon, LeafIcon } from "@/components/icons";

// Карусель баннеров главной. Список картинок приходит с сервера
// (lib/banners.ts читает public/banners при рендере страницы) — браузер больше
// не пробует по одному ~12 кандидатов на каждый визит. Если файлов нет —
// показывается запасной зелёный баннер с текстом.
//
// Пропорции намеренно вытянутые (16:7 на телефоне, 16:6 на широком экране):
// баннер — верх первого экрана, и чем он ниже, тем раньше видно каталог.
// 16:6 — та же пропорция, что рекомендована в public/banners/README.txt, так
// что на десктопе картинка показывается без обрезки.
const AUTOPLAY_MS = 5000;

export default function HeroBanner({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  // Пауза автопрокрутки, пока пользователь читает баннер: наведён курсор или
  // фокус стоит на одной из кнопок (клавиатурная навигация).
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const count = images.length;
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
      ref={sectionRef}
      className="group relative overflow-hidden rounded-3xl bg-brand-100"
      aria-roledescription="карусель"
      aria-label="Акции и предложения"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div className="relative aspect-[16/7] w-full sm:aspect-[16/6]">
        {images.map((src, i) => (
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
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              className="object-cover"
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          <ArrowButton side="left" onClick={() => go(-1)} />
          <ArrowButton side="right" onClick={() => go(1)} />

          {/* Точки: показывают, сколько всего баннеров и где мы сейчас. */}
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-3">
            {images.map((src, i) => (
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
        </>
      )}
    </section>
  );
}

// Круглая стеклянная кнопка по краю баннера.
//
// Видна всегда, а не только при наведении: на телефоне наводить нечем, а на
// десктопе скрытая стрелка не подсказывает, что баннеров несколько. Чтобы она
// читалась и на светлом, и на тёмном снимке, под полупрозрачным белым лежит
// тонкая тёмная обводка.
function ArrowButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Предыдущий баннер" : "Следующий баннер"}
      className={`absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-brand-800 shadow-lg ring-1 ring-black/10 backdrop-blur transition hover:scale-105 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/30 active:scale-95 sm:h-11 sm:w-11 ${
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      <ChevronIcon direction={side} className="h-5 w-5 sm:h-6 sm:w-6" />
    </button>
  );
}

function FallbackHero() {
  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white sm:p-10">
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
