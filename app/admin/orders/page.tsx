import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatDate } from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/delivery";
import { decryptField } from "@/lib/crypto";
import OrderStatusSelect from "@/components/admin/order-status-select";
import OrderTrackingInput from "@/components/admin/order-tracking-input";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrders() {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, customer_name, phone, email, address, comment, status, total, delivery_method, delivery_cost, tracking_number, created_at, order_items(id, name, price, qty)"
    )
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Заказы ({orders.length})
      </h2>

      {orders.length === 0 ? (
        <div className="card p-6 text-center text-brand-400">
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
                  <div className="text-sm text-brand-400">
                    {formatDate(o.created_at)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-extrabold text-brand-700">
                    {formatPrice(o.total)}
                  </span>
                  <OrderStatusSelect id={o.id} status={o.status} />
                  <OrderTrackingInput id={o.id} tracking={o.tracking_number ?? null} />
                </div>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="text-sm text-brand-700">
                  <div><span className="text-brand-400">Клиент:</span> {o.customer_name}</div>
                  <div><span className="text-brand-400">Телефон:</span> {decryptField(o.phone)}</div>
                  {o.email && <div><span className="text-brand-400">Email:</span> {decryptField(o.email)}</div>}
                  <div><span className="text-brand-400">Адрес:</span> {decryptField(o.address)}</div>
                  {o.delivery_method && (
                    <div>
                      <span className="text-brand-400">Доставка:</span>{" "}
                      {deliveryMethodLabel(o.delivery_method)}
                      {o.delivery_cost ? ` — ${formatPrice(o.delivery_cost)}` : ""}
                    </div>
                  )}
                  {o.comment && <div><span className="text-brand-400">Комментарий:</span> {o.comment}</div>}
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
