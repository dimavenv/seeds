import type { MetadataRoute } from "next";
import { getCategories, getSitemapProducts } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";

// Карта сайта: статические страницы + категории + все товары. Собирается
// из базы, вручную её вести не нужно — добавили сорт в админке, он тут же
// появился в карте.
//
// Роут намеренно ДИНАМИЧЕСКИЙ, а не кэшируемый. Раньше стоял ISR на час, и
// после массовых правок (например, переименования артикулов скриптом) карта
// ещё час отдавала старые адреса. Сбросить этот кэш нельзя: sitemap.xml —
// метаданные Next, он запекается на сборке, и revalidatePath/revalidateTag
// его не задевают (проверено). Поэтому кэша здесь нет вовсе.
//
// По нагрузке это ничего не стоит: карту запрашивают поисковые роботы
// несколько раз в сутки, а запрос — один к PocketBase на три поля.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // /payment и /how-to-order намеренно НЕ перечисляем: обе страницы делают
  // redirect на /delivery, а редирект в sitemap.xml Search Console считает
  // ошибкой («Страница с переадресацией»).
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/catalog"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/delivery"), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/reviews"), changeFrequency: "weekly", priority: 0.5 },
    { url: absoluteUrl("/support"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/offer"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/returns"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/requisites"), changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    // Кэшируемые читатели (см. lib/data.ts): карта сайта живёт по ISR, а
    // no-store-выборка выводила её из статической генерации и запекалась без
    // товаров. getProducts здесь использовать нельзя — он намеренно no-store.
    const [categories, products] = await Promise.all([
      getCategories(),
      getSitemapProducts(),
    ]);
    return [
      ...staticPages,
      ...categories.map((c) => ({
        url: absoluteUrl(`/catalog/${c.slug}`),
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...products.map((p) => ({
        url: absoluteUrl(`/product/${p.slug}`),
        // Дата последней правки карточки: переписали описание сорта — поисковик
        // видит новый lastmod и приходит переобходить страницу.
        lastModified: p.updated_at
          ? new Date(p.updated_at)
          : p.created_at
          ? new Date(p.created_at)
          : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}
