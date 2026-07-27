import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/seo";

// robots.txt: индексируем витрину, закрываем служебные разделы.
//
// Отдельно закрываем варианты каталога с сортировкой, фильтром цены и поиском:
// они отдают тот же список товаров под десятком разных URL. Дублей в индексе
// от этого не будет и без robots (на страницах каталога стоит canonical на
// чистый URL, см. app/catalog/[category]/page.tsx), но краулер тратил бы на
// них бюджет обхода вместо новых карточек сортов.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/api/",
        "/cart",
        "/checkout",
        "/favorites",
        "/order/",
        "/login",
        "/register",
        "/*?sort=",
        "/*?min=",
        "/*?max=",
        "/*?q=",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    // Директиву Host понимает Яндекс — она склеивает зеркала домена.
    host: siteUrl(),
  };
}
