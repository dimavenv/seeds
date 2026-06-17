import CatalogFilters from "@/components/catalog-filters";
import ProductGrid from "@/components/product-grid";
import { getProducts } from "@/lib/data";

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

  const products = await getProducts({
    categorySlug,
    q: searchParams.q?.trim() || undefined,
    sort,
    minPrice: searchParams.min ? Number(searchParams.min) : undefined,
    maxPrice: searchParams.max ? Number(searchParams.max) : undefined,
  });

  return (
    <div className="container-page py-6">
      <h1 className="mb-1 text-2xl font-bold text-brand-800">{title}</h1>
      <p className="mb-5 text-sm text-brand-500">
        Найдено товаров: {products.length}
      </p>
      <CatalogFilters />
      <ProductGrid products={products} />
    </div>
  );
}
