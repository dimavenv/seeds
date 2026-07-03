import Link from "next/link";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session.configured) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-brand-800">
            Админка недоступна
          </h1>
          <p className="mt-2 text-brand-700">
            Не настроен Supabase. Укажите переменные окружения в{" "}
            <code className="rounded bg-brand-100 px-1">.env.local</code> и
            создайте администратора (см. README).
          </p>
        </div>
      </div>
    );
  }

  if (!session.isAdmin) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-brand-800">Доступ запрещён</h1>
          <p className="mt-2 text-brand-700">
            Раздел доступен только администраторам. Если вы администратор, но
            видите это сообщение — выполните <code className="rounded bg-brand-100 px-1">supabase/make-admin.sql</code> для своего email.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/account" className="btn-primary">
              В личный кабинет
            </Link>
            <Link href="/login" className="btn-outline">
              Сменить аккаунт
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-bold text-brand-800">Админ-панель</h1>
        <Link href="/admin" className="btn-outline !py-1.5">Дашборд</Link>
        <Link href="/admin/products" className="btn-outline !py-1.5">Товары</Link>
        <Link href="/admin/orders" className="btn-outline !py-1.5">Заказы</Link>
        <Link href="/admin/support" className="btn-outline !py-1.5">Заявки</Link>
        <Link href="/admin/reviews" className="btn-outline !py-1.5">Отзывы</Link>
        <Link href="/account" className="btn-outline !py-1.5">Личный кабинет</Link>
        <span className="ml-auto text-sm text-brand-400">{session.email}</span>
      </div>
      {children}
    </div>
  );
}
