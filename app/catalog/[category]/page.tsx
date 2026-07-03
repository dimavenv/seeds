import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CatalogView, {
  type CatalogSearchParams,
} from "@/components/catalog-view";
import { getCategoryBySlug } from "@/lib/data";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  const category = await getCategoryBySlug(params.category);
  if (!category) return { title: "Категория не найдена" };
  return {
    title: `${category.name} — семена с доставкой`,
    description: `Семена: ${category.name.toLowerCase()}. Проверенные сорта с доставкой почтой по всей России.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: CatalogSearchParams;
}) {
  const category = await getCategoryBySlug(params.category);
  if (!category) notFound();

  return (
    <CatalogView
      title={category.name}
      categorySlug={category.slug}
      searchParams={searchParams}
    />
  );
}
