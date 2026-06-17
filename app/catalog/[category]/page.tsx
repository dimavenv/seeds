import { notFound } from "next/navigation";
import CatalogView, {
  type CatalogSearchParams,
} from "@/components/catalog-view";
import { getCategoryBySlug } from "@/lib/data";

export const revalidate = 60;

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
