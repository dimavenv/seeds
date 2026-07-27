"use client";

import { useState } from "react";
import ProductImage from "@/components/product-image";
import { variantsFor, type ImageVariantMap } from "@/lib/image-variants";

// Галерея фото товара: крупное главное изображение + лента миниатюр.
//
// alt приходит с названием сорта («Семена Бычье сердце») — по нему картинку
// находят в Яндекс.Картинках и Google Images, а для семян это заметный
// источник трафика: люди ищут, как выглядит плод.
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

  if (images.length === 0) {
    return (
      <div className="card flex aspect-square items-center justify-center bg-brand-50 text-brand-300">
        нет фото
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="card relative aspect-square overflow-hidden bg-brand-50">
        <ProductImage
          key={current}
          src={current}
          alt={alt}
          variants={variantsFor(variants, current)}
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="absolute inset-0 h-full w-full object-cover"
          priority
        />
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-brand-50 transition ${
                i === active
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
    </div>
  );
}
