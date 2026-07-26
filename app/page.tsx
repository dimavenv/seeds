import Link from "next/link";
import ProductGrid from "@/components/product-grid";
import HeroBanner from "@/components/hero-banner";
import { getProducts } from "@/lib/data";
import { DELIVERY_COST, FREE_DELIVERY_FROM } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

export const revalidate = 60;

export default async function HomePage() {
  const [featured, fresh] = await Promise.all([
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onlyNew: true, limit: 8 }),
  ]);

  return (
    <div className="container-page py-6">
      {/* Баннеры (свои картинки из public/banners/ или запасной баннер) */}
      <HeroBanner />

      {/* Хиты */}
      {featured.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-brand-800">Хиты продаж</h2>
            <Link href="/catalog" className="text-sm font-semibold text-brand-600 hover:text-brand-800">
              Все товары →
            </Link>
          </div>
          <ProductGrid products={featured} />
        </section>
      )}

      {/* Новинки */}
      {fresh.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-brand-800">Новинки</h2>
            <Link href="/catalog?sort=new" className="text-sm font-semibold text-brand-600 hover:text-brand-800">
              Смотреть все →
            </Link>
          </div>
          <ProductGrid products={fresh} />
        </section>
      )}

      {/* Преимущества */}
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          // Стоимость доставки берём из общих констант (настраиваются через
          // env), чтобы главная не расходилась с корзиной и оформлением.
          [
            "🚚",
            "Доставка по России",
            `${formatPrice(DELIVERY_COST)}; бесплатно при заказе от ${formatPrice(FREE_DELIVERY_FROM)}`,
          ],
          ["🌱", "Высокая всхожесть", "Проверенные семена от производителей"],
          ["🔒", "Удобная оплата", "Оформление заказа за пару минут"],
        ].map(([icon, title, text]) => (
          <div key={title} className="card flex items-start gap-3 p-5">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className="font-semibold text-brand-800">{title}</div>
              <div className="text-sm text-brand-600">{text}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
