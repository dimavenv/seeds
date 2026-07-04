import { createClient } from "@/lib/supabase/server";
import { deliveryMethodLabel } from "@/lib/delivery";
import { decryptField } from "@/lib/crypto";
import OrderCard, { type AdminOrder } from "@/components/admin/order-card";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: number;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  comment: string | null;
  status: OrderStatus;
  total: number;
  delivery_method: string | null;
  delivery_cost: number | null;
  tracking_number: string | null;
  created_at: string;
  order_items: {
    id: number;
    name: string;
    price: number;
    qty: number;
    product: { image_url: string | null; slug: string } | null;
  }[];
};

export default async function AdminOrders() {
  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, customer_name, phone, email, address, comment, status, total, delivery_method, delivery_cost, tracking_number, created_at, order_items(id, name, price, qty, product:products(image_url, slug))"
    )
    .order("created_at", { ascending: false });

  // Расшифровываем контакты на сервере и отдаём клиенту плоские объекты.
  const orders: AdminOrder[] = ((data ?? []) as unknown as OrderRow[]).map((o) => ({
    id: o.id,
    created_at: o.created_at,
    customer_name: o.customer_name,
    phone: decryptField(o.phone) ?? o.phone,
    email: o.email ? decryptField(o.email) : null,
    address: decryptField(o.address) ?? o.address,
    comment: o.comment,
    status: o.status,
    total: o.total,
    delivery_label: o.delivery_method ? deliveryMethodLabel(o.delivery_method) : null,
    delivery_cost: o.delivery_cost,
    tracking_number: o.tracking_number,
    items: (o.order_items ?? []).map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      qty: it.qty,
      image_url: it.product?.image_url ?? null,
      slug: it.product?.slug ?? null,
    })),
  }));

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
          {orders.map((o, i) => (
            <OrderCard key={o.id} order={o} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
