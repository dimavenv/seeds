import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import VacationBanner from "@/components/vacation-banner";
import CookieConsent from "@/components/cookie-consent";
import Analytics from "@/components/analytics";
import JsonLd from "@/components/json-ld";
import { getCategories, getVacationUntil } from "@/lib/data";
import {
  ORGANIZATION,
  ORGANIZATION_ID,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_NAME_LATIN,
  absoluteUrl,
  siteUrl,
  verificationCodes,
} from "@/lib/seo";

export const metadata: Metadata = {
  // Базовый адрес из окружения: от него Next достраивает canonical и OG-ссылки.
  metadataBase: new URL(siteUrl()),
  title: {
    // default — для страниц без своего title; template — для всех остальных,
    // чтобы бренд в конце заголовка появлялся сам и одинаково.
    default: `${SITE_NAME} — семена томатов и овощей почтой по России`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  // Коды подтверждения прав из Яндекс.Вебмастера и Google Search Console.
  // Пока переменные окружения пустые — мета-теги не выводятся вообще.
  verification: verificationCodes(),
  openGraph: {
    siteName: SITE_NAME,
    locale: "ru_RU",
    type: "website",
    url: siteUrl(),
    title: `${SITE_NAME} — семена томатов и овощей почтой по России`,
    description: SITE_DESCRIPTION,
  },
};

// Организация и сайт — разметка уровня всего домена, поэтому живёт в layout.
// У Organization фиксированный @id: страница отзывов добавляет к тому же узлу
// рейтинг магазина, и поисковик склеивает их в одну сущность.
function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID(),
        name: SITE_NAME,
        alternateName: SITE_NAME_LATIN,
        legalName: ORGANIZATION.legalName,
        url: siteUrl(),
        logo: absoluteUrl("/logo.png"),
        image: absoluteUrl("/logo.png"),
        email: ORGANIZATION.email,
        taxID: ORGANIZATION.taxId,
        vatID: ORGANIZATION.taxId,
        identifier: ORGANIZATION.registrationId,
        address: {
          "@type": "PostalAddress",
          postalCode: ORGANIZATION.postalCode,
          addressRegion: ORGANIZATION.addressRegion,
          addressLocality: ORGANIZATION.addressLocality,
          addressCountry: ORGANIZATION.addressCountry,
        },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: ORGANIZATION.email,
          availableLanguage: "Russian",
          areaServed: "RU",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl()}/#website`,
        url: siteUrl(),
        name: SITE_NAME,
        inLanguage: "ru-RU",
        publisher: { "@id": ORGANIZATION_ID() },
        // Поиск по сайту: даёт шанс на строку поиска прямо в выдаче.
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: absoluteUrl("/catalog?q={search_term_string}"),
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, vacationUntil] = await Promise.all([
    getCategories(),
    getVacationUntil(),
  ]);

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Применяем тему до отрисовки — без мигания светлой темы. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        <JsonLd data={siteJsonLd()} />
      </head>
      <body className="flex min-h-screen flex-col">
        <StoreProvider>
          {/* Для клавиатуры/скринридеров: перепрыгнуть шапку сразу к содержимому. */}
          <a href="#main" className="skip-link">
            Перейти к содержимому
          </a>
          <Header />
          <VacationBanner until={vacationUntil} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer categories={categories} />
          <CookieConsent />
        </StoreProvider>
        <Analytics />
      </body>
    </html>
  );
}
