import Link from "next/link";
import Logo from "@/components/logo";
import type { Category } from "@/lib/types";

export default function Footer({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-16 border-t border-brand-100 bg-surface">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center text-brand-600">
            <Logo className="h-9 w-auto max-w-[180px]" />
          </div>
          <p className="mt-3 text-sm text-brand-600">
            Коллекционные семена томатов, перцев, баклажанов, дынь и арбузов с
            доставкой по России.
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
            <li><Link href="/about" className="hover:text-brand-800">О нас</Link></li>
            <li><Link href="/delivery" className="hover:text-brand-800">Доставка и оплата</Link></li>
            <li><Link href="/how-to-order" className="hover:text-brand-800">Как заказать</Link></li>
            <li><Link href="/reviews" className="hover:text-brand-800">Отзывы</Link></li>
            <li><Link href="/support" className="hover:text-brand-800">Поддержка</Link></li>
            <li><Link href="/favorites" className="hover:text-brand-800">Избранное</Link></li>
            <li><Link href="/privacy" className="hover:text-brand-800">Политика конфиденциальности</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-800">Контакты</h3>
          <ul className="space-y-1.5 text-sm text-brand-600">
            <li>Доставка почтой по всей России</li>
            <li>Пн–Вс: 9:00–20:00</li>
            <li>info@tomatsemena.ru</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-100 py-4">
        <div className="container-page text-center text-xs text-brand-500">
          © {new Date().getFullYear()} Tomat Semena. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
