import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatPrice, formatDate } from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/delivery";
import { ORDER_STATUS_LABELS, type Order, type Product } from "@/lib/types";
import OrderStatusSteps from "@/components/order-status-steps";
import ReorderButton from "@/components/reorder-button";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session.configured) redirect("/login");
  if (!session.userId) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, customer_name, phone, email, address, comment, status, total, delivery_method, delivery_cost, created_at, order_items(id, product_id, name, price, qty)"
    )
    .eq("id", Number(params.id))
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!data) notFound();
  const order = data as Order;
  const items = order.order_items ?? [];

  // Текущие товары (для картинок и кнопки «заказать ещё раз»).
  const ids = items.map((i) => i.product_id).filter((x): x is number => !!x);
  const productMap = new Map<number, Product>();
  if (ids.length) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, slug, name, price, image_url, images")
      .in("id", ids);
    for (const p of (prods ?? []) as Product[]) productMap.set(p.id, p);
  }

  const imgOf = (pid: number | null) => {
    const p = pid ? productMap.get(pid) : null;
    return p?.image_url || p?.images?.[0] || null;
  };
  const goods = items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = order.delivery_cost ?? Math.max(0, order.total - goods);

  const reorderItems = items
    .map((i) => (i.product_id ? productMap.get(i.product_id) : null))
    .filter((p): p is Product => !!p)
    .map((product) => ({
      product,
      qty: items.find((i) => i.product_id === product.id)?.qty ?? 1,
    }));

  return (
    <div className="container-page py-8">
      <nav className="mb-4 text-sm text-brand-500">
        <Link href="/account" className="hover:text-brand-700">
          Личный кабинет
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-brand-700">Заказ #{order.id}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Заказ #{order.id}</h1>
          <p className="text-sm text-brand-500">
            от {formatDate(order.created_at)} ·{" "}
            <span className="font-semibold text-brand-700">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </p>
        </div>
        <ReorderButton items={reorderItems} />
      </div>

      {/* Прогресс */}
      <div className="card p-5">
        <OrderStatusSteps status={order.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Товары */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-brand-800">
            Состав заказа
          </h2>
          <div className="space-y-3">
            {items.map((it) => {
              const img = imgOf(it.product_id);
              const slug = it.product_id
                ? productMap.get(it.product_id)?.slug
                : null;
              const card = (
                <div className="card flex items-center gap-4 p-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                    {img && (
                      <Image
                        src={img}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-brand-800">{it.name}</div>
                    <div className="text-sm text-brand-500">
                      {formatPrice(it.price)} × {it.qty}
                    </div>
                  </div>
                  <div className="whitespace-nowrap font-bold text-brand-700">
                    {formatPrice(it.price * it.qty)}
                  </div>
                </div>
              );
              return slug ? (
                <Link key={it.id} href={`/product/${slug}`} className="block transition hover:opacity-90">
                  {card}
                </Link>
              ) : (
                <div key={it.id}>{card}</div>
              );
            })}
          </div>
        </div>

        {/* Сводка и доставка */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-bold text-brand-800">Оплата</h3>
            <div className="space-y-1.5 text-sm text-brand-700">
              <div className="flex justify-between">
                <span>Товары</span>
                <span>{formatPrice(goods)}</span>
              </div>
              <div className="flex justify-between">
                <span>Доставка {order.delivery_method && `· ${deliveryMethodLabel(order.delivery_method)}`}</span>
                <span>{formatPrice(delivery)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-brand-100 pt-2 text-base font-extrabold text-brand-800">
                <span>Итого</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          <div className="card p-5 text-sm text-brand-700">
            <h3 className="mb-3 font-bold text-brand-800">Доставка</h3>
            <div><span className="text-brand-500">Получатель:</span> {order.customer_name}</div>
            <div><span className="text-brand-500">Телефон:</span> {order.phone}</div>
            <div className="mt-1"><span className="text-brand-500">Адрес:</span> {order.address}</div>
            {order.comment && (
              <div className="mt-1"><span className="text-brand-500">Комментарий:</span> {order.comment}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
