// Общие SEO-константы и помощники.
//
// Базовый адрес сайта нигде не хардкодим: он нужен в robots.txt, sitemap.xml,
// canonical-ссылках и JSON-LD, а на стенде/препроде отличается от боевого.
// Порядок источников: NEXT_PUBLIC_SITE_URL (виден и клиенту) → SITE_URL (уже
// используется и в адресах возврата с оплаты) → боевой домен как последний фолбэк.

import type { Metadata } from "next";
import { DELIVERY_COST } from "@/lib/delivery";

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

// Картинка предпросмотра ссылки для соцсетей и мессенджеров. Одна на весь
// сайт; у карточки товара своя — там уместнее фото сорта.
// Пересобрать после смены логотипа: npm run img:og (scripts/make-og-image.mjs).
export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Tomat Semena — коллекционные семена томатов и овощей",
};

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

// ---------------------------------------------------------------------------
// Условия сделки в разметке товара: offers.shippingDetails и
// offers.hasMerchantReturnPolicy. Оба поля Google ждёт в товарных карточках и
// без них пишет «Отсутствует поле» в отчёте «Товарные объявления».
//
// Значения берём из тех же источников, что видит покупатель: стоимость
// доставки — из lib/delivery.ts, сроки и условия возврата — со страниц
// /delivery и /returns. Разметка, расходящаяся с видимой страницей, — прямое
// нарушение правил, а не мелкая неточность.
// ---------------------------------------------------------------------------

// Доставка. Порог бесплатной доставки (от 3000 ₽) здесь НЕ указан намеренно:
// он считается от суммы всей корзины, а разметка описывает один товар. Пакетик
// семян стоит 45–80 ₽, так что обещать в выдаче бесплатную доставку значило бы
// вводить в заблуждение почти каждого, кто по ней придёт.
//
// handlingTime 0–1 день: «собираем и передаём посылку в службу доставки сразу
// после успешной оплаты» (/delivery). transitTime 2–5 дней — оттуда же, у обеих
// служб срок одинаковый. Страна только RU: пересылка семян за границу запрещена
// законодательством РФ, и об этом там же сказано.
export function shippingDetailsJsonLd() {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: DELIVERY_COST,
      currency: "RUB",
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "RU",
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 0,
        maxValue: 1,
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: 2,
        maxValue: 5,
        unitCode: "DAY",
      },
    },
  };
}

// Возврат. MerchantReturnNotPermitted — это не «мы не хотим», а закон:
// по Постановлению Правительства РФ № 2463 от 31.12.2020 семена, посадочный
// материал и растения надлежащего качества возврату и обмену не подлежат.
// Ровно это написано на /returns, и разметка обязана совпадать со страницей.
//
// Права на замену или возврат денег за товар НЕНАДЛЕЖАЩЕГО качества это не
// отменяет: returnPolicyCategory описывает добровольный возврат исправного
// товара, брак в него не входит.
//
// Если в каталоге появятся сопутствующие товары (инвентарь, горшки), значение
// у них другое — 7 дней с обратной пересылкой за счёт покупателя, — и поле
// придётся считать от вида товара, а не отдавать одно на всех.
export function returnPolicyJsonLd() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "RU",
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    url: absoluteUrl("/returns"),
  };
}

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
