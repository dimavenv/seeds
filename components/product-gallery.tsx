"use client";

import { useState } from "react";
import ProductImage from "@/components/product-image";
import ImageLightbox from "@/components/image-lightbox";
import { ZoomIcon } from "@/components/icons";
import { variantsFor, type ImageVariantMap } from "@/lib/image-variants";

// Галерея фото товара: крупное главное изображение + лента миниатюр.
//
// alt приходит с названием сорта («Семена Бычье сердце») — по нему картинку
// находят в Яндекс.Картинках и Google Images, а для семян это заметный
// источник трафика: люди ищут, как выглядит плод.
//
// Нажатие на главное фото открывает просмотр во весь экран с приближением
// (components/image-lightbox.tsx). Сам просмотр появляется только после клика:
// в разметке страницы его нет, и оригинал фото до этого момента не грузится.
export default function ProductGallery({
  images,
  alt,
  variants,
}: {
  images: string[];
  alt: string;
  /** Облегчённые варианты фото; нет — покажем оригиналы. */
  variants?: ImageVariantMap;
}) {
  const [active, setActive] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="card flex aspect-square items-center justify-center bg-brand-50 text-brand-300">
        нет фото
      </div>
    );
  }

  const index = Math.min(active, images.length - 1);
  const current = images[index];

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        aria-label={`${alt} — открыть фото во весь экран`}
        className="card group relative aspect-square overflow-hidden bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <ProductImage
          key={current}
          src={current}
          alt={alt}
          variants={variantsFor(variants, current)}
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="absolute inset-0 h-full w-full object-cover"
          priority
        />
        {/* Значок лупы: подсказывает, что фото открывается крупно. На
            телефоне виден всегда — там нет наведения курсора. */}
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-100 transition group-hover:bg-black/65 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
        >
          <ZoomIcon sign="in" />
        </span>
      </button>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-brand-50 transition ${
                i === index
                  ? "border-brand-600"
                  : "border-transparent hover:border-brand-200"
              }`}
            >
              {/* alt миниатюры служит и подписью кнопки для скринридера,
                  поэтому отдельный aria-label здесь не нужен. */}
              <ProductImage
                src={url}
                alt={`${alt} — фото ${i + 1}`}
                variants={variantsFor(variants, url)}
                sizes="80px"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {zoomOpen && (
        <ImageLightbox
          images={images}
          alt={alt}
          variants={variants}
          index={index}
          onIndexChange={setActive}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}
