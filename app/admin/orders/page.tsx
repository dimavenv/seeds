import { createServerPb } from "@/lib/pb/server";
import { fetchOrdersWithItems } from "@/lib/orders";
import { formatPrice, formatDate } from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/delivery";
import { decryptField } from "@/lib/crypto";
import OrderStatusSelect from "@/components/admin/order-status-select";
import OrderTrackingInput from "@/components/admin/order-tracking-input";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrders() {
  // Клиент с токеном админа из cookie — правила PocketBase дают видеть всё.
  const pb = createServerPb();
  let orders: Order[] = [];
  try {
    orders = await fetchOrdersWithItems(pb);
  } catch {
    orders = [];
  }

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
                    Заказ #{o.number}
                  </div>
                  <div className="text-sm text-brand-500">
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
                  <div><span className="text-brand-500">Клиент:</span> {o.customer_name}</div>
                  <div><span className="text-brand-500">Телефон:</span> {decryptField(o.phone)}</div>
                  {o.email && <div><span className="text-brand-500">Email:</span> {decryptField(o.email)}</div>}
                  <div><span className="text-brand-500">Адрес:</span> {decryptField(o.address)}</div>
                  {o.delivery_method && (
                    <div>
                      <span className="text-brand-500">Доставка:</span>{" "}
                      {deliveryMethodLabel(o.delivery_method)}
                      {o.delivery_cost ? ` — ${formatPrice(o.delivery_cost)}` : ""}
                    </div>
                  )}
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
