"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LeafIcon } from "@/components/icons";

// Карусель баннеров. Список картинок приходит с сервера (lib/banners.ts читает
// public/banners при рендере) — клиент ничего не «прощупывает» и не ловит 404.
// Если картинок нет — показывается запасной зелёный баннер с текстом.
export default function HeroBanner({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = images.length;
  const go = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count]
  );

  // Автопрокрутка каждые 5 секунд; при наведении/касании — пауза.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 0) return <FallbackHero />;

  const current = index % count;

  return (
    <section
      className="group relative overflow-hidden rounded-3xl bg-brand-100 motion-safe:animate-fade-in"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        setPaused(false);
        if (start == null || count <= 1) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="relative aspect-[16/9] w-full">
        {images.map((src, i) => (
          <Link
            key={src}
            href="/catalog"
            aria-label="Перейти в каталог"
            aria-hidden={i !== current}
            tabIndex={i === current ? 0 : -1}
            className={`absolute inset-0 overflow-hidden transition-opacity duration-700 ${
              i === current ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Баннер ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className={`h-full w-full object-cover ${
                i === current ? "motion-safe:animate-ken-burns" : ""
              }`}
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Стрелки: на десктопе появляются при наведении */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Предыдущий баннер"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-brand-800 opacity-0 shadow-sm backdrop-blur transition hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Следующий баннер"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 text-brand-800 opacity-0 shadow-sm backdrop-blur transition hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 sm:flex"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((src, i) => (
              <button
                key={src}
                onClick={() => setIndex(i)}
                aria-label={`Баннер ${i + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === current ? "w-6 bg-white" : "w-2.5 bg-white/60 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FallbackHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white sm:p-12">
      {/* Декоративные плавающие листья */}
      <LeafIcon className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rotate-12 text-white/10 motion-safe:animate-float sm:h-56 sm:w-56" />
      <LeafIcon
        className="pointer-events-none absolute -bottom-8 right-24 hidden h-28 w-28 -rotate-45 text-white/10 motion-safe:animate-float sm:block"
      />
      <div className="relative max-w-2xl">
        <span className="badge bg-white/15 text-white motion-safe:animate-fade-up">
          <LeafIcon className="mr-1 h-4 w-4" /> Сезон посадки открыт
        </span>
        <h1
          className="mt-4 text-3xl font-extrabold leading-tight motion-safe:animate-fade-up sm:text-5xl"
          style={{ animationDelay: "100ms" }}
        >
          Семена для богатого урожая
        </h1>
        <p
          className="mt-4 text-base text-brand-50/90 motion-safe:animate-fade-up sm:text-lg"
          style={{ animationDelay: "200ms" }}
        >
          Проверенные сорта с доставкой почтой по всей России.
        </p>
        <div
          className="mt-6 flex flex-wrap gap-3 motion-safe:animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <Link href="/catalog" className="btn-accent">
            Перейти в каталог
          </Link>
        </div>
      </div>
    </section>
  );
}
