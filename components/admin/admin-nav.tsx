"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Навигация админки с подсветкой активного раздела (server-layout сам не знает
// текущий путь — поэтому клиентский компонент).
const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "Дашборд", exact: true },
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/products", label: "Товары" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/promos", label: "Промокоды" },
  { href: "/admin/accounts", label: "Аккаунты" },
  { href: "/admin/support", label: "Заявки" },
  { href: "/admin/reviews", label: "Отзывы" },
  { href: "/admin/log", label: "Журнал" },
  { href: "/account", label: "Личный кабинет", exact: true },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((l) => {
        const active = l.exact
          ? pathname === l.href
          : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? "btn-primary !py-1.5" : "btn-outline !py-1.5"}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
