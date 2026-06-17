"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LeafIcon } from "@/components/icons";

// Кандидаты на баннеры: положите файлы public/banners/1.jpg … 5.jpg
// (можно .jpg или .png — поменяйте расширение ниже). Несуществующие
// картинки автоматически пропускаются. Если файлов нет — показывается
// запасной зелёный баннер с текстом.
const CANDIDATES = [
  "/banners/1.jpg",
  "/banners/2.jpg",
  "/banners/3.jpg",
  "/banners/4.jpg",
  "/banners/5.jpg",
];

export default function HeroBanner() {
  const [available, setAvailable] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  // Предзагрузка: оставляем только реально существующие картинки.
  useEffect(() => {
    let active = true;
    CANDIDATES.forEach((src) => {
      const img = new window.Image();
      img.onload = () => {
        if (active) setAvailable((prev) => (prev.includes(src) ? prev : [...prev, src]));
      };
      img.onerror = () => {
        if (active) setFailed((prev) => (prev.includes(src) ? prev : [...prev, src]));
      };
      img.src = src;
    });
    return () => {
      active = false;
    };
  }, []);

  // Сохраняем порядок CANDIDATES среди загруженных.
  const images = CANDIDATES.filter((s) => available.includes(s));

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);

  const allChecked = available.length + failed.length === CANDIDATES.length;

  // Пока не подтвердилась ни одна картинка (и проверка ещё не закончена) —
  // показываем запасной баннер, чтобы не было пустоты.
  if (images.length === 0) {
    // Если все проверены и картинок нет — постоянный запасной баннер.
    return <FallbackHero subtle={!allChecked} />;
  }

  const current = index % images.length;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-100">
      <div className="relative aspect-[16/6] w-full">
        {images.map((src, i) => (
          <Link
            key={src}
            href="/catalog"
            aria-label="Перейти в каталог"
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Баннер ${i + 1}`} className="h-full w-full object-cover" />
          </Link>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setIndex(i)}
              aria-label={`Баннер ${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                i === current ? "w-6 bg-white" : "w-2.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FallbackHero({ subtle }: { subtle?: boolean }) {
  return (
    <section
      className={`overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white sm:p-12 ${
        subtle ? "opacity-95" : ""
      }`}
    >
      <div className="max-w-2xl">
        <span className="badge bg-white/15 text-white">
          <LeafIcon className="mr-1 h-4 w-4" /> Сезон посадки открыт
        </span>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">
          Семена для богатого урожая
        </h1>
        <p className="mt-4 text-base text-brand-50/90 sm:text-lg">
          Проверенные сорта с доставкой почтой по всей России.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/catalog" className="btn-accent">
            Перейти в каталог
          </Link>
        </div>
      </div>
    </section>
  );
}
