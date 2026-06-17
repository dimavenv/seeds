import Link from "next/link";
import ProductGrid from "@/components/product-grid";
import HeroBanner from "@/components/hero-banner";
import CategoryTile from "@/components/category-tile";
import { getCategories, getProducts } from "@/lib/data";

export const revalidate = 60;

const categoryEmoji: Record<string, string> = {
  tomaty: "🍅",
  "perec-sladkiy": "🫑",
  "perec-chili": "🌶️",
  baklazhany: "🍆",
  kukuruza: "🌽",
  kartofel: "🥔",
  dynya: "🍈",
  arbuz: "🍉",
};

export default async function HomePage() {
  const [categories, featured, fresh] = await Promise.all([
    getCategories(),
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onlyNew: true, limit: 8 }),
  ]);

  return (
    <div className="container-page py-6">
      {/* Баннеры (свои картинки из public/banners/ или запасной баннер) */}
      <HeroBanner />

      {/* Категории */}
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-brand-800">Категории</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <CategoryTile
              key={c.id}
              category={c}
              emoji={categoryEmoji[c.slug] ?? "🌱"}
            />
          ))}
        </div>
      </section>

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
          ["🚚", "Доставка по России", "Почтой и СДЭК в любой регион"],
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
