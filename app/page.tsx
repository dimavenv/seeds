import Link from "next/link";
import ProductGrid from "@/components/product-grid";
import { getCategories, getProducts } from "@/lib/data";
import { LeafIcon } from "@/components/icons";

export const revalidate = 60;

const categoryEmoji: Record<string, string> = {
  ovoshchi: "🍅",
  zelen: "🌿",
  yagody: "🍓",
  tsvety: "🌸",
  bakhcha: "🍉",
  mitseliy: "🍄",
};

export default async function HomePage() {
  const [categories, featured, fresh] = await Promise.all([
    getCategories(),
    getProducts({ featured: true, limit: 8 }),
    getProducts({ onlyNew: true, limit: 8 }),
  ]);

  return (
    <div className="container-page py-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white sm:p-12">
        <div className="max-w-2xl">
          <span className="badge bg-white/15 text-white">
            <LeafIcon className="mr-1 h-4 w-4" /> Сезон посадки открыт
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">
            Семена для богатого урожая
          </h1>
          <p className="mt-4 text-base text-brand-50/90 sm:text-lg">
            Овощи, зелень, ягоды, цветы и грибной мицелий — проверенные сорта с
            доставкой почтой по всей России.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/catalog" className="btn-accent">
              Перейти в каталог
            </Link>
            <Link
              href="/catalog/tsvety"
              className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20"
            >
              Семена цветов
            </Link>
          </div>
        </div>
      </section>

      {/* Категории */}
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-brand-800">Категории</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-md"
            >
              <span className="text-3xl">{categoryEmoji[c.slug] ?? "🌱"}</span>
              <span className="text-sm font-semibold text-brand-800">
                {c.name}
              </span>
            </Link>
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
