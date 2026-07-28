import Link from "next/link";
import type { Category } from "@/lib/types";
import CategoryIcon from "@/components/category-icon";
import { LeafIcon } from "@/components/icons";

// Строка чипов категорий для каталога. Первый чип — «Все семена» (→ /catalog),
// далее категории с нарисованными иконками (→ /catalog/<slug>). Активный чип
// подсвечен.
export default function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  const chip = (active: boolean) =>
    // pl-2 при pr-4: у иконки уже есть собственные поля внутри картинки,
    // поэтому слева отступ меньше — иначе чип выглядит перекошенным.
    `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-2 pr-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
      active
        ? "bg-brand-600 text-white shadow-sm"
        : "bg-brand-50 text-brand-700 hover:bg-brand-100"
    }`;

  return (
    // -mx-1 px-1: чтобы кольцо фокуса у крайнего чипа не обрезалось краем
    // прокручиваемой области.
    <nav className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-2">
      <Link href="/catalog" className={chip(!activeSlug)}>
        <LeafIcon className="h-5 w-5 shrink-0" />
        Все семена
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/catalog/${c.slug}`}
          className={chip(activeSlug === c.slug)}
        >
          <CategoryIcon slug={c.slug} className="h-7 w-7" />
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
