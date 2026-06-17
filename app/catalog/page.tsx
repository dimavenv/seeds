import CatalogView, {
  type CatalogSearchParams,
} from "@/components/catalog-view";

export const revalidate = 60;

export default function CatalogPage({
  searchParams,
}: {
  searchParams: CatalogSearchParams;
}) {
  const title = searchParams.q ? `Поиск: «${searchParams.q}»` : "Все семена";
  return <CatalogView title={title} searchParams={searchParams} />;
}
