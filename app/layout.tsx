import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import VacationBanner from "@/components/vacation-banner";
import CookieConsent from "@/components/cookie-consent";
import { getCategories, getVacationUntil } from "@/lib/data";

export const metadata: Metadata = {
  metadataBase: new URL("https://tomatsemena.ru"),
  title: "Tomat Semena — интернет-магазин семян",
  description:
    "Семена томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов с доставкой по России.",
  openGraph: {
    siteName: "Tomat Semena",
    locale: "ru_RU",
    type: "website",
  },
};

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
      </body>
    </html>
  );
}
