import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVacationUntil } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, type Order } from "@/lib/types";
import VacationSetting from "@/components/admin/vacation-setting";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = createClient();

  const [{ count: productsCount }, { count: ordersCount }, { data: recent }, vacationUntil] =
    await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase.from("orders").select("*", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id, customer_name, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      getVacationUntil(),
    ]);

  const recentOrders = (recent ?? []) as Pick<
    Order,
    "id" | "customer_name" | "total" | "status" | "created_at"
  >[];

  return (
    <div className="space-y-6">
      <VacationSetting until={vacationUntil} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm text-brand-400">Товаров в каталоге</div>
          <div className="mt-1 text-3xl font-extrabold text-brand-800">
            {productsCount ?? 0}
          </div>
          <Link href="/admin/products" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            Управление →
          </Link>
        </div>
        <div className="card p-5">
          <div className="text-sm text-brand-400">Всего заказов</div>
          <div className="mt-1 text-3xl font-extrabold text-brand-800">
            {ordersCount ?? 0}
          </div>
          <Link href="/admin/orders" className="mt-2 inline-block text-sm font-semibold text-brand-700">
            Все заказы →
          </Link>
        </div>
        <div className="card flex flex-col justify-center p-5">
          <Link href="/admin/products/new" className="btn-accent">
            + Добавить товар
          </Link>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-lg font-bold text-brand-800">
          Последние заказы
        </h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-brand-400">Заказов пока нет.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-brand-400">
              <tr>
                <th className="py-2">№</th>
                <th>Клиент</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-brand-100">
                  <td className="py-2 font-semibold">#{o.id}</td>
                  <td>{o.customer_name}</td>
                  <td>{formatPrice(o.total)}</td>
                  <td>{ORDER_STATUS_LABELS[o.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
