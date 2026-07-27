import CategoryNav from "@/components/category-nav";
import CatalogSort from "@/components/catalog-sort";
import ProductGrid from "@/components/product-grid";
import JsonLd from "@/components/json-ld";
import { getCategories, getProducts } from "@/lib/data";
import { descriptionParagraphs } from "@/lib/product-text";
import { absoluteUrl, siteUrl } from "@/lib/seo";
import type { Category } from "@/lib/types";

export type CatalogSearchParams = {
  q?: string;
  sort?: string;
  min?: string;
  max?: string;
};

const SORT_VALUES = ["new", "price_asc", "price_desc", "name"] as const;

// Есть ли в адресе параметры, сужающие/переупорядочивающие выборку. Такие
// варианты страницы закрываются от индексации (см. generateMetadata страниц
// каталога): содержимое то же, что на чистом адресе, а URL — другой.
// Сортировку по умолчанию (?sort=new) за сужение не считаем.
export function hasNarrowingParams(searchParams: CatalogSearchParams): boolean {
  const { q, sort, min, max } = searchParams;
  return Boolean(
    q?.trim() || (sort && sort !== "new") || min?.trim() || max?.trim()
  );
}

// Цена из query-строки: только конечное неотрицательное число, иначе фильтр
// не применяем. Раньше ?min=abc давал NaN → запрос к PocketBase падал → сайт
// показывал ДЕМО-товары вместо реального каталога.
function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Хлебные крошки для поисковика: в выдаче вместо голого URL показывается путь
// «Главная → Каталог → Томаты», по нему заметно выше кликают.
function breadcrumbsJsonLd(category: Category) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Главная", item: siteUrl() },
      { name: "Каталог", item: absoluteUrl("/catalog") },
      { name: category.name, item: absoluteUrl(`/catalog/${category.slug}`) },
    ].map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

export default async function CatalogView({
  title,
  category,
  searchParams,
}: {
  title: string;
  category?: Category;
  searchParams: CatalogSearchParams;
}) {
  const sort = (SORT_VALUES as readonly string[]).includes(searchParams.sort ?? "")
    ? (searchParams.sort as (typeof SORT_VALUES)[number])
    : "new";

  const [products, categories] = await Promise.all([
    getProducts({
      categorySlug: category?.slug,
      q: searchParams.q?.trim() || undefined,
      sort,
      minPrice: parsePrice(searchParams.min),
      maxPrice: parsePrice(searchParams.max),
    }),
    getCategories(),
  ]);

  // TODO (пункт 2.2 плана): текст категории заполняется в админке PocketBase
  // (поле description коллекции categories) — 60–150 слов о том, какие сорта
  // в разделе, чем они хороши и для каких условий подходят. Пока поле пустое,
  // блок не выводится: пустая рамка-заглушка хуже, чем её отсутствие.
  const intro = descriptionParagraphs(category?.description ?? null);

  return (
    <div className="container-page py-6">
      {category && <JsonLd data={breadcrumbsJsonLd(category)} />}
      <CategoryNav categories={categories} activeSlug={category?.slug} />
      {/* Единственный h1 страницы: название категории — под него она и
          ранжируется по запросам вида «семена томатов купить». */}
      <h1 className="mb-1 text-2xl font-bold text-brand-800">{title}</h1>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-500">
          Найдено товаров: {products.length}
        </p>
        <CatalogSort value={sort} />
      </div>
      {intro.length > 0 && (
        // Текст над сеткой — в серверном HTML: страница остаётся серверным
        // компонентом, поэтому описание индексируется без выполнения JS.
        <div className="mb-6 max-w-3xl space-y-3 leading-relaxed text-brand-600">
          {intro.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      )}
      <ProductGrid products={products} />
    </div>
  );
}
