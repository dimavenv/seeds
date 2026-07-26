import type { MetadataRoute } from "next";
import { getCategories, getSitemapProducts } from "@/lib/data";

const BASE = "https://tomatsemena.ru";

// Карта сайта: статические страницы + категории + все товары.
// Обновляется раз в час (ISR), чтобы новые товары попадали в индекс.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/delivery`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/reviews`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/how-to-order`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/offer`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/returns`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/requisites`, changeFrequency: "yearly", priority: 0.2 },
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
        url: `${BASE}/catalog/${c.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...products.map((p) => ({
        url: `${BASE}/product/${p.slug}`,
        lastModified: p.created_at ? new Date(p.created_at) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}
