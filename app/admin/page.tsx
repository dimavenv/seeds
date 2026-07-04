import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVacationUntil } from "@/lib/data";
import { formatPrice, formatDate } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import VacationSetting from "@/components/admin/vacation-setting";
import OrderStatusBadge from "@/components/admin/order-status-badge";
import SalesChart, { type SalesDay, type TopCategory } from "@/components/admin/sales-chart";

export const dynamic = "force-dynamic";

// Окно данных графика: 28 дней максимум + столько же на «прошлый период».
const DAYS_WINDOW = 56;

type ChartOrderRow = {
  total: number;
  status: OrderStatus;
  created_at: string;
  order_items: {
    qty: number;
    price: number;
    product: { category: { name: string } | null } | null;
  }[];
};

function buildSalesDays(rows: ChartOrderRow[]): SalesDay[] {
  const days: SalesDay[] = [];
  const today = new Date();
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      orderedRub: 0,
      orderedQty: 0,
      deliveredRub: 0,
      deliveredQty: 0,
    });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const o of rows) {
    if (o.status === "cancelled") continue;
    const day = byDate.get(String(o.created_at).slice(0, 10));
    if (!day) continue;
    const qty = (o.order_items ?? []).reduce((s, it) => s + (it.qty ?? 0), 0);
    const rub = Number(o.total) || 0;
    day.orderedRub += rub;
    day.orderedQty += qty;
    if (o.status === "done") {
      day.deliveredRub += rub;
      day.deliveredQty += qty;
    }
  }
  return days;
}

// ТОП-категория по выручке за последние 28 дней.
function buildTopCategory(rows: ChartOrderRow[], since: string): TopCategory {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const o of rows) {
    if (o.status === "cancelled") continue;
    if (String(o.created_at).slice(0, 10) < since) continue;
    for (const it of o.order_items ?? []) {
      const revenue = (Number(it.price) || 0) * (it.qty ?? 0);
      const name = it.product?.category?.name ?? "Без категории";
      byCategory.set(name, (byCategory.get(name) ?? 0) + revenue);
      total += revenue;
    }
  }
  if (total <= 0) return null;
  const [name, revenue] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, share: Math.round((revenue / total) * 100) };
}

export default async function AdminDashboard() {
  const supabase = createClient();

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (DAYS_WINDOW - 1));
  const since = sinceDate.toISOString().slice(0, 10);

  const [
    { count: productsCount },
    { count: ordersCount },
    { count: newOrdersCount },
    { data: recent },
    { data: chartRows },
    vacationUntil,
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("orders")
      .select("id, customer_name, total, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select(
        "total, status, created_at, order_items(qty, price, product:products(category:categories(name)))"
      )
      .gte("created_at", `${since}T00:00:00Z`),
    getVacationUntil(),
  ]);

  const rows = (chartRows ?? []) as unknown as ChartOrderRow[];
  const salesDays = buildSalesDays(rows);
  const topCategory = buildTopCategory(
    rows,
    salesDays[salesDays.length - 28].date
  );

  const recentOrders = (recent ?? []) as Pick<
    Order,
    "id" | "customer_name" | "total" | "status" | "created_at"
  >[];

  return (
    <div className="space-y-6">
      {/* Статистика + карточки «Заказы» и «Товары» */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesChart days={salesDays} topCategory={topCategory} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="card flex-1 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-brand-500">Всего заказов</div>
              {(newOrdersCount ?? 0) > 0 && (
                <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  Новых: {newOrdersCount}
                </span>
              )}
            </div>
            <div className="mt-1 text-3xl font-extrabold text-brand-800">
              {ordersCount ?? 0}
            </div>
            <Link
              href="/admin/orders"
              className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:text-brand-800"
            >
              Все заказы →
            </Link>
          </div>

          <div className="card flex-1 p-5">
            <div className="text-sm text-brand-500">Товаров в каталоге</div>
            <div className="mt-1 text-3xl font-extrabold text-brand-800">
              {productsCount ?? 0}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/admin/products"
                className="text-sm font-semibold text-brand-600 hover:text-brand-800"
              >
                Управление →
              </Link>
            </div>
            <Link href="/admin/products/new" className="btn-accent mt-3 w-full">
              + Добавить товар
            </Link>
          </div>
        </div>
      </div>

      {/* Последние заказы */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-800">Последние заказы</h2>
          <Link
            href="/admin/orders"
            className="text-sm font-semibold text-brand-600 hover:text-brand-800"
          >
            Все заказы →
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-brand-500">Заказов пока нет.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-brand-500">
              <tr>
                <th className="py-2 font-semibold">№</th>
                <th className="font-semibold">Дата</th>
                <th className="font-semibold">Клиент</th>
                <th className="font-semibold">Сумма</th>
                <th className="font-semibold">Статус</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-brand-100">
                  <td className="py-2.5 font-semibold">#{o.id}</td>
                  <td className="text-brand-600">{formatDate(o.created_at)}</td>
                  <td>{o.customer_name}</td>
                  <td className="font-semibold">{formatPrice(o.total)}</td>
                  <td>
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Режим отпуска */}
      <VacationSetting until={vacationUntil} />
    </div>
  );
}
