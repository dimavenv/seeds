import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CatalogView, {
  type CatalogSearchParams,
  hasNarrowingParams,
} from "@/components/catalog-view";
import { getCategoryBySlug } from "@/lib/data";
import { SITE_NAME } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: CatalogSearchParams;
}): Promise<Metadata> {
  const category = await getCategoryBySlug(params.category);
  // Категории нет: страница отдаст вёрстку 404, но со статусом 200 (причина —
  // в комментарии у компонента ниже), поэтому закрываем адрес от индексации
  // мета-тегом.
  if (!category)
    return {
      title: "Категория не найдена",
      robots: { index: false, follow: false },
    };

  const title =
    category.seo_title?.trim() ||
    `${category.name} — купить семена почтой по России`;
  const description =
    category.seo_description?.trim() ||
    // TODO: заполните seo_description категории в админке PocketBase —
    // осмысленный текст под конкретную категорию соберёт больше кликов, чем
    // эта автоматическая строка.
    `${category.name}: каталог сортовых семян с фото, описанием и ценами. ` +
      `Доставка Ozon и Почтой России. Магазин «${SITE_NAME}».`;

  return {
    title,
    description,
    // Canonical всегда на ЧИСТЫЙ адрес категории: ?sort=price_asc,
    // ?min=100&max=300 и поиск отдают тот же список товаров, и без canonical
    // это были бы десятки дублей одной страницы в индексе.
    alternates: { canonical: `/catalog/${category.slug}` },
    // Мало склеить дубли — отфильтрованные выборки не должны и попадать в
    // индекс: сами по себе они бесполезны в выдаче. follow оставляем, чтобы
    // краулер шёл по ссылкам на карточки товаров.
    ...(hasNarrowingParams(searchParams)
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      type: "website",
      title,
      description,
    },
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
  // ВНИМАНИЕ: Next отдаёт здесь вёрстку 404, но со статусом 200 — корневой
  // app/loading.tsx включает стриминг, ответ уходит клиенту раньше, чем
  // выполняется notFound(), и код ответа поменять уже нельзя. Настоящий 404
  // вернётся, если убрать глобальный loading.tsx (ценой индикатора загрузки
  // при переходах). Пока адрес закрыт от индексации noindex'ом выше.
  if (!category) notFound();

  return (
    <CatalogView
      title={category.name}
      category={category}
      searchParams={searchParams}
    />
  );
}
