import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { getCategories } from "@/lib/data";

export const metadata: Metadata = {
  title: "Semena Collection — интернет-магазин семян",
  description:
    "Семена томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов с доставкой по России.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategories();

  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col">
        <StoreProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer categories={categories} />
        </StoreProvider>
      </body>
    </html>
  );
}
