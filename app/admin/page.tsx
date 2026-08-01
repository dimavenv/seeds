import Link from "next/link";
import { createServerPb } from "@/lib/pb/server";
import { mapOrder } from "@/lib/pb/shared";
import { fetchOrdersWithItems } from "@/lib/orders";
import { getVacationUntil } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/lib/types";
import { fetchTraffic } from "@/lib/metrika-stats";
import { mergeSeries } from "@/lib/traffic-series";
import VacationSetting from "@/components/admin/vacation-setting";
import OrderStatusBadge from "@/components/admin/order-status-badge";
import SalesChart, { type SalesOrderPoint } from "@/components/admin/sales-chart";
import VisitorsCard from "@/components/admin/visitors-card";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const pb = createServerPb();

  // Заказы за последние 8 недель — хватает на график 28 дней + прошлый период.
  const chartSince = new Date();
  chartSince.setHours(0, 0, 0, 0);
  chartSince.setDate(chartSince.getDate() - 55);

  // getList(1,1) заодно возвращает totalItems — так считаем количество.
  const [productsPage, recentPage, newPage, vacationUntil, chartWindow, traffic] =
    await Promise.all([
      pb.collection("products").getList(1, 1).catch(() => ({ totalItems: 0 })),
      pb
        .collection("orders")
        .getList(1, 5, { sort: "-placed_at" })
        .catch(() => ({ totalItems: 0, items: [] as never[] })),
      pb
        .collection("orders")
        .getList(1, 1, { filter: 'status = "new"' })
        .catch(() => ({ totalItems: 0 })),
      getVacationUntil(),
      fetchOrdersWithItems(pb, {
        ordersFilter: pb.filter("placed_at >= {:since} || created >= {:since}", {
          since: chartSince,
        }),
      }).catch(() => [] as Order[]),
      // Посещаемость за неделю — плитка «Посетители». Метрика может быть не
      // подключена: fetchTraffic не бросает, а возвращает причину.
      fetchTraffic(7),
    ]);

  const productsCount = productsPage.totalItems;
  const ordersCount = recentPage.totalItems;
  const newCount = newPage.totalItems;
  const recentOrders = (("items" in recentPage ? recentPage.items : []) as never[]).map(
    (r) => mapOrder(r)
  ) as Order[];

  // Компактные точки для графика; отменённые заказы не считаем продажами.
  const chartOrders: SalesOrderPoint[] = chartWindow
    .filter((o) => o.status !== "cancelled")
    .map((o) => {
      const items = o.order_items ?? [];
      const goods = items.reduce((s, i) => s + i.price * i.qty, 0);
      return {
        date: o.created_at,
        total: goods || o.total,
        qty: items.reduce((s, i) => s + i.qty, 0),
        done: o.status === "done",
        items: items.map((i) => ({ name: i.name, qty: i.qty, sum: i.price * i.qty })),
      };
    });

  // Посетители за неделю рядом с заказами: заказы уже посчитаны выше, дни —
  // из Метрики.
  const visitorDays = traffic.ok ? mergeSeries(traffic.days, chartOrders) : [];
  const prevVisits = traffic.ok ? traffic.prevDays.map((d) => d.visits) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Статистика продаж */}
        <div className="min-w-0 lg:col-span-2">
          <SalesChart orders={chartOrders} />
        </div>

        {/* Заказы и товары */}
        <div className="min-w-0 space-y-4">
          {traffic.ok ? (
            <VisitorsCard days={visitorDays} prevVisits={prevVisits} />
          ) : (
            <div className="card p-5">
              <div className="text-sm text-brand-500">Посетители сайта</div>
              <p className="mt-1 text-sm text-brand-600">
                {traffic.reason === "not-configured"
                  ? "Яндекс.Метрика ещё не подключена — данных о посещаемости нет."
                  : traffic.message}
              </p>
              <Link
                href="/admin/analytics"
                className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline"
              >
                Как подключить →
              </Link>
            </div>
          )}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm text-brand-500">Всего заказов</div>
                <div className="mt-1 text-3xl font-extrabold text-brand-800">
                  {ordersCount}
                </div>
              </div>
              {newCount > 0 && (
                <Link
                  href="/admin/orders?status=new"
                  className="badge bg-accent-500/15 text-accent-600 hover:bg-accent-500/25"
                >
                  {newCount} нов.
                </Link>
              )}
            </div>

            {recentOrders.length > 0 && (
              <ul className="mt-3 divide-y divide-brand-100 border-t border-brand-100">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="flex items-center gap-2 py-2 text-sm transition hover:opacity-80"
                    >
                      <span className="font-semibold text-brand-800">#{o.number}</span>
                      <span className="min-w-0 flex-1 truncate text-brand-600">
                        {o.customer_name}
                      </span>
                      <span className="whitespace-nowrap font-semibold text-brand-700">
                        {formatPrice(o.total)}
                      </span>
                      <OrderStatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/admin/orders"
              className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline"
            >
              Все заказы →
            </Link>
          </div>

          <div className="card p-5">
            <div className="text-sm text-brand-500">Товаров в каталоге</div>
            <div className="mt-1 text-3xl font-extrabold text-brand-800">
              {productsCount}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link href="/admin/products/new" className="btn-accent !py-2">
                + Добавить товар
              </Link>
              <Link
                href="/admin/products"
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                Управление →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <VacationSetting until={vacationUntil} />
    </div>
  );
}
