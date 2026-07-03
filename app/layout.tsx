import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import VacationBanner from "@/components/vacation-banner";
import BackToTop from "@/components/back-to-top";
import { getCategories, getVacationUntil } from "@/lib/data";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://tomatsemena.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tomat Semena — интернет-магазин семян",
    template: "%s — Tomat Semena",
  },
  description:
    "Семена томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов с доставкой по России.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Tomat Semena",
    title: "Tomat Semena — интернет-магазин семян",
    description:
      "Семена томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов с доставкой по России.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f8ee" },
    { media: "(prefers-color-scheme: dark)", color: "#11160f" },
  ],
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

  // Картинки товаров идут из Supabase Storage — раннее соединение ускоряет
  // загрузку первых фото.
  const supabaseOrigin = (() => {
    try {
      return process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
        : null;
    } catch {
      return null;
    }
  })();

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Применяем тему до отрисовки — без мигания светлой темы. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        {supabaseOrigin && (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        )}
      </head>
      <body className="flex min-h-screen flex-col">
        <StoreProvider>
          <Header />
          <VacationBanner until={vacationUntil} />
          <main className="flex-1">{children}</main>
          <Footer categories={categories} />
          <BackToTop />
        </StoreProvider>
      </body>
    </html>
  );
}
