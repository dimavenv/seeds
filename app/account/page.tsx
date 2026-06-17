import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatPrice, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, type Order } from "@/lib/types";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();

  if (!session.configured) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-brand-800">
            Личный кабинет недоступен
          </h1>
          <p className="mt-2 text-brand-600">
            Не настроен Supabase. Укажите ключи в <code className="rounded bg-brand-100 px-1">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!session.userId) {
    redirect("/login");
  }

  // Заказы покупателя (RLS вернёт только его собственные).
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, customer_name, total, status, created_at, order_items(id, name, price, qty)"
    )
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Личный кабинет</h1>
          <p className="text-sm text-brand-500">
            {session.email}
            <span className="ml-2 badge bg-brand-100 text-brand-700">
              {session.isAdmin ? "Администратор" : "Покупатель"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.isAdmin && (
            <Link href="/admin" className="btn-primary">
              Админ-панель
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <h2 className="mb-3 text-lg font-bold text-brand-800">История заказов</h2>

      {orders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-brand-600">У вас пока нет заказов.</p>
          <Link href="/catalog" className="btn-accent mt-4">
            Перейти в каталог
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-brand-800">Заказ #{o.id}</div>
                  <div className="text-sm text-brand-500">
                    {formatDate(o.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge bg-brand-500 text-white">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                  <span className="text-lg font-extrabold text-brand-700">
                    {formatPrice(o.total)}
                  </span>
                </div>
              </div>
              <ul className="mt-3 space-y-1 border-t border-brand-100 pt-3 text-sm text-brand-700">
                {(o.order_items ?? []).map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {it.name} × {it.qty}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatPrice(it.price * it.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
