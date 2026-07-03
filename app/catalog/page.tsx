import type { Metadata } from "next";
import CatalogView, {
  type CatalogSearchParams,
} from "@/components/catalog-view";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Каталог семян",
  description:
    "Все семена: томаты, перцы, баклажаны, кукуруза, картофель, дыни и арбузы. Доставка по России.",
};

export default function CatalogPage({
  searchParams,
}: {
  searchParams: CatalogSearchParams;
}) {
  const title = searchParams.q ? `Поиск: «${searchParams.q}»` : "Все семена";
  return <CatalogView title={title} searchParams={searchParams} />;
}
