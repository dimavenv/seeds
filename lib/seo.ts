// Общие SEO-константы и помощники.
//
// Базовый адрес сайта нигде не хардкодим: он нужен в robots.txt, sitemap.xml,
// canonical-ссылках и JSON-LD, а на стенде/препроде отличается от боевого.
// Порядок источников: NEXT_PUBLIC_SITE_URL (виден и клиенту) → SITE_URL (уже
// используется для returnUrl Альфа-Банка) → боевой домен как последний фолбэк.

import type { Metadata } from "next";

const FALLBACK_SITE_URL = "https://tomatsemena.ru";

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    FALLBACK_SITE_URL;
  return raw.replace(/\/+$/, "");
}

// Абсолютный URL страницы: absoluteUrl("/catalog/tomaty").
export function absoluteUrl(path = "/"): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

// Метаданные служебной страницы — корзины, входа, кабинета и прочего, что
// поисковику показывать незачем.
//
// Дают две вещи. Во-первых, свой canonical: без него страница наследует
// canonical корневого layout, то есть объявляет себя копией ГЛАВНОЙ. Это прямой
// сигнал поисковику «эти адреса — одно и то же», и он заведомо неверный.
// Во-вторых, noindex, follow: не индексировать саму страницу, но переходить по
// ссылкам с неё.
//
// Эти же адреса закрыты в robots.txt. Одно другому не мешает, но и не заменяет:
// закрытую в robots страницу робот не скачивает и мету на ней не читает.
// Запрет здесь — на случай, если адрес всё-таки окажется доступен (например,
// его уберут из Disallow), и чтобы неверный canonical не жил в разметке.
export function servicePageMetadata(path: string, title: string): Metadata {
  return {
    title,
    alternates: { canonical: path },
    robots: { index: false, follow: true },
  };
}

// Бренд в мете — по-русски: в Яндексе ищут «томат семена», а не латиницей.
export const SITE_NAME = "Томат Семена";
export const SITE_NAME_LATIN = "Tomat Semena";

export const SITE_DESCRIPTION =
  "Коллекционные семена томатов, перцев, баклажанов, кукурузы, картофеля, " +
  "дынь и арбузов. Доставка Ozon и Почтой России по всей стране.";

// Реквизиты продавца — источник данных для JSON-LD Organization.
// Держим здесь, чтобы страница «Реквизиты» и разметка не разъезжались.
export const ORGANIZATION = {
  legalName: "ИП Кутушева Вера Евгеньевна",
  taxId: "231214684650", // ИНН
  registrationId: "322237500354090", // ОГРНИП
  email: "info@tomatsemena.ru",
  postalCode: "350000",
  addressRegion: "Краснодарский край",
  addressLocality: "Краснодар",
  addressCountry: "RU",
} as const;

// @id организации: один и тот же узел в разметке layout и страницы отзывов,
// чтобы поисковик склеил их в одну сущность (а не в две разные компании).
export const ORGANIZATION_ID = () => `${siteUrl()}/#organization`;

// Коды верификации из панелей вебмастера. Пустая строка = мета не выводится.
export function verificationCodes(): { yandex?: string; google?: string } {
  const yandex = process.env.YANDEX_VERIFICATION?.trim();
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  return {
    ...(yandex ? { yandex } : {}),
    ...(google ? { google } : {}),
  };
}
