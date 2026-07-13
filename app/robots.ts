import type { MetadataRoute } from "next";

// robots.txt: индексируем витрину, закрываем служебные разделы.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/api/", "/cart", "/checkout", "/order/"],
    },
    sitemap: "https://tomatsemena.ru/sitemap.xml",
  };
}
