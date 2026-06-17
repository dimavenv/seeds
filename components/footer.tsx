import Link from "next/link";
import { LeafIcon } from "@/components/icons";
import type { Category } from "@/lib/types";

export default function Footer({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-16 border-t border-brand-100 bg-white">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-brand-600">
            <LeafIcon className="h-6 w-6" />
            <span className="text-base font-extrabold text-brand-700">
              Semena Collection
            </span>
          </div>
          <p className="mt-3 text-sm text-brand-600">
            Семена овощей, зелени, ягод и цветов с доставкой по России.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-800">Каталог</h3>
          <ul className="space-y-1.5 text-sm text-brand-600">
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link href={`/catalog/${c.slug}`} className="hover:text-brand-800">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-800">Покупателям</h3>
          <ul className="space-y-1.5 text-sm text-brand-600">
            <li><Link href="/catalog" className="hover:text-brand-800">Все семена</Link></li>
            <li><Link href="/cart" className="hover:text-brand-800">Корзина</Link></li>
            <li><Link href="/favorites" className="hover:text-brand-800">Избранное</Link></li>
            <li><Link href="/login" className="hover:text-brand-800">Личный кабинет</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-800">Контакты</h3>
          <ul className="space-y-1.5 text-sm text-brand-600">
            <li>Доставка почтой по всей России</li>
            <li>Пн–Вс: 9:00–20:00</li>
            <li>info@semena-collection.ru</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-100 py-4">
        <div className="container-page text-center text-xs text-brand-500">
          © {new Date().getFullYear()} Semena Collection. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
