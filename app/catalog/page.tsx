import type { Metadata } from "next";
import CatalogView, {
  type CatalogSearchParams,
  hasNarrowingParams,
} from "@/components/catalog-view";
import { SITE_DESCRIPTION } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: CatalogSearchParams;
}): Promise<Metadata> {
  const query = searchParams.q?.trim();

  // Страница результатов поиска — не посадочная: индексировать её незачем
  // (запросов бесконечно много, содержимое дублирует каталог), но пройти по
  // ссылкам на товары краулеру полезно.
  if (query) {
    return {
      title: `Поиск: «${query}»`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/catalog" },
    };
  }

  return {
    title: "Каталог семян — томаты, перцы, баклажаны, дыни, арбузы",
    description: SITE_DESCRIPTION,
    alternates: { canonical: "/catalog" },
    ...(hasNarrowingParams(searchParams)
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      type: "website",
      title: "Каталог семян",
      description: SITE_DESCRIPTION,
    },
  };
}

export default function CatalogPage({
  searchParams,
}: {
  searchParams: CatalogSearchParams;
}) {
  const title = searchParams.q ? `Поиск: «${searchParams.q}»` : "Все семена";
  return <CatalogView title={title} searchParams={searchParams} />;
}
