import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatDate } from "@/lib/format";
import OrderStatusSelect from "@/components/admin/order-status-select";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrders() {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, customer_name, phone, email, address, comment, status, total, created_at, order_items(id, name, price, qty)"
    )
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Заказы ({orders.length})
      </h2>

      {orders.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          Заказов пока нет.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-brand-800">
                    Заказ #{o.id}
                  </div>
                  <div className="text-sm text-brand-500">
                    {formatDate(o.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-extrabold text-brand-700">
                    {formatPrice(o.total)}
                  </span>
                  <OrderStatusSelect id={o.id} status={o.status} />
                </div>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="text-sm text-brand-700">
                  <div><span className="text-brand-500">Клиент:</span> {o.customer_name}</div>
                  <div><span className="text-brand-500">Телефон:</span> {o.phone}</div>
                  {o.email && <div><span className="text-brand-500">Email:</span> {o.email}</div>}
                  <div><span className="text-brand-500">Адрес:</span> {o.address}</div>
                  {o.comment && <div><span className="text-brand-500">Комментарий:</span> {o.comment}</div>}
                </div>
                <div className="text-sm">
                  <div className="mb-1 font-semibold text-brand-700">Состав:</div>
                  <ul className="space-y-1 text-brand-700">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
