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
      minPrice: searchParams.min ? Number(searchParams.min) : undefined,
      maxPrice: searchParams.max ? Number(searchParams.max) : undefined,
    }),
    getCategories(),
  ]);

  return (
    <div className="container-page py-6">
      <CategoryNav categories={categories} activeSlug={categorySlug} />
      <h1 className="mb-1 text-2xl font-bold text-brand-800">{title}</h1>
      <p className="mb-5 text-sm text-brand-400">
        Найдено товаров: {products.length}
      </p>
      <ProductGrid products={products} />
    </div>
  );
}
