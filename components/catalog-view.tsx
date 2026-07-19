import CategoryNav from "@/components/category-nav";
import ProductGrid from "@/components/product-grid";
import { getCategories, getProducts } from "@/lib/data";

export type CatalogSearchParams = {
  q?: string;
  sort?: string;
  min?: string;
  max?: string;
};

const SORT_VALUES = ["new", "price_asc", "price_desc", "name"] as const;

// Цена из query-строки: только конечное неотрицательное число, иначе фильтр
// не применяем. Раньше ?min=abc давал NaN → запрос к PocketBase падал → сайт
// показывал ДЕМО-товары вместо реального каталога.
function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function CatalogView({
  title,
  categorySlug,
  searchParams,
}: {
  title: string;
  categorySlug?: string;
  searchParams: CatalogSearchParams;
}) {
  const sort = (SORT_VALUES as readonly string[]).includes(searchParams.sort ?? "")
    ? (searchParams.sort as (typeof SORT_VALUES)[number])
    : "new";

  const [products, categories] = await Promise.all([
    getProducts({
      categorySlug,
      q: searchParams.q?.trim() || undefined,
      sort,
      minPrice: parsePrice(searchParams.min),
      maxPrice: parsePrice(searchParams.max),
    }),
    getCategories(),
  ]);

  return (
    <div className="container-page py-6">
      <CategoryNav categories={categories} activeSlug={categorySlug} />
      <h1 className="mb-1 text-2xl font-bold text-brand-800">{title}</h1>
      <p className="mb-5 text-sm text-brand-500">
        Найдено товаров: {products.length}
      </p>
      <ProductGrid products={products} />
    </div>
  );
}
