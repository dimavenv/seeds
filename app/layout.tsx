import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import VacationBanner from "@/components/vacation-banner";
import { getCategories, getVacationUntil } from "@/lib/data";

export const metadata: Metadata = {
  title: "Tomat Semena — интернет-магазин семян",
  description:
    "Семена томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов с доставкой по России.",
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
          <Header />
          <VacationBanner until={vacationUntil} />
          <main className="flex-1">{children}</main>
          <Footer categories={categories} />
        </StoreProvider>
      </body>
    </html>
  );
}
