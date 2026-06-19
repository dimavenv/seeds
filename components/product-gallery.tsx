"use client";

import { useState } from "react";
import Image from "next/image";

// Галерея фото товара: крупное главное изображение + лента миниатюр.
export default function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
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
        <Image
          key={current}
          src={current}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
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
              aria-label={`Фото ${i + 1}`}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-brand-50 transition ${
                i === active
                  ? "border-brand-600"
                  : "border-transparent hover:border-brand-200"
              }`}
            >
              <Image src={url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
