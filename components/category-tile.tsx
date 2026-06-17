"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/types";

// Картинку категории кладите в public/categories/<slug>.jpg
// (например public/categories/tomaty.jpg). Если файла нет — показывается эмодзи.
export default function CategoryTile({
  category,
  emoji,
}: {
  category: Category;
  emoji: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  const src = `/categories/${category.slug}.jpg`;

  return (
    <Link
      href={`/catalog/${category.slug}`}
      className="card flex flex-col items-center gap-2 overflow-hidden p-4 text-center transition hover:shadow-md"
    >
      <div className="flex h-16 w-16 items-center justify-center">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={category.name}
            className="h-16 w-16 rounded-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className="text-3xl">{emoji}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-brand-800">{category.name}</span>
    </Link>
  );
}
