import Link from "next/link";
import ProductGrid from "@/components/product-grid";
import HeroBanner from "@/components/hero-banner";
import Reveal from "@/components/reveal";
import { getProducts } from "@/lib/data";
import { getBannerImages } from "@/lib/banners";

export const revalidate = 60;

export default async function HomePage() {
  const [featured, fresh, banners] = await Promise.all([
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onlyNew: true, limit: 8 }),
    getBannerImages(),
  ]);

  return (
    <div className="container-page py-6">
      {/* Баннеры (свои картинки из public/banners/ или запасной баннер) */}
      <HeroBanner images={banners} />

      {/* Хиты */}
      {featured.length > 0 && (
        <Reveal>
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-brand-800">Хиты продаж</h2>
              <Link
                href="/catalog"
                className="group text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
              >
                Все товары{" "}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
            <ProductGrid products={featured} />
          </section>
        </Reveal>
      )}

      {/* Новинки */}
      {fresh.length > 0 && (
        <Reveal>
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-brand-800">Новинки</h2>
              <Link
                href="/catalog?sort=new"
                className="group text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
              >
                Смотреть все{" "}
                <span className="inline-block transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
            <ProductGrid products={fresh} />
          </section>
        </Reveal>
      )}

      {/* Преимущества */}
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          ["🚚", "Доставка по России", "Почтой России и Ozon, фикс. 300 ₽"],
          ["🌱", "Высокая всхожесть", "Проверенные семена от производителей"],
          ["🔒", "Удобная оплата", "Оформление заказа за пару минут"],
        ].map(([icon, title, text], i) => (
          <Reveal key={title} delay={i * 100}>
            <div className="card flex h-full items-start gap-3 p-5 transition duration-300 motion-safe:hover:-translate-y-1 hover:shadow-md">
              <span className="text-2xl">{icon}</span>
              <div>
                <div className="font-semibold text-brand-800">{title}</div>
                <div className="text-sm text-brand-600">{text}</div>
              </div>
            </div>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
