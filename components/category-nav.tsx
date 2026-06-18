import Link from "next/link";
import type { Category } from "@/lib/types";
import { getCategoryEmoji } from "@/lib/categories";

// Строка чипов категорий для каталога. Первый чип — «Все семена» (→ /catalog),
// далее категории с эмодзи (→ /catalog/<slug>). Активный чип подсвечен.
export default function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-brand-600 text-white"
        : "bg-brand-50 text-brand-700 hover:bg-brand-100"
    }`;

  return (
    <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
      <Link href="/catalog" className={chip(!activeSlug)}>
        🌱 Все семена
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/catalog/${c.slug}`}
          className={chip(activeSlug === c.slug)}
        >
          {getCategoryEmoji(c.slug)} {c.name}
        </Link>
      ))}
    </nav>
  );
}
