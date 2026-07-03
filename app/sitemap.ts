import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tomatsemena.ru";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/catalog",
    "/about",
    "/delivery",
    "/reviews",
    "/support",
    "/how-to-order",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  return [
    ...staticPages,
    ...categories.map((c) => ({
      url: `${SITE_URL}/catalog/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.slug}`,
      lastModified: p.created_at ? new Date(p.created_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
