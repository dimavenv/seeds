"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { LeafIcon } from "@/components/icons";

// Карусель баннеров главной. Список картинок приходит с сервера
// (lib/banners.ts читает public/banners при рендере страницы) — браузер больше
// не пробует по одному ~12 кандидатов на каждый визит. Если файлов нет —
// показывается запасной зелёный баннер с текстом.
export default function HeroBanner({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  // Пауза автопрокрутки, пока курсор над баннером (пользователь читает/целится).
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (images.length <= 1 || hovered) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length, hovered]);

  if (images.length === 0) {
    return <FallbackHero />;
  }

  const current = index % images.length;

  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-brand-100"
      aria-roledescription="карусель"
      aria-label="Акции и предложения"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[16/9] w-full">
        {images.map((src, i) => (
          <Link
            key={src}
            href="/catalog"
            aria-label="Перейти в каталог"
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

      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setIndex(i)}
              aria-label={`Баннер ${i + 1}`}
              aria-current={i === current}
              className={`h-2.5 rounded-full transition-all ${
                i === current ? "w-6 bg-white" : "w-2.5 bg-white/60 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FallbackHero() {
  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white sm:p-12">
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
