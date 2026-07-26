import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getSessionPb } from "@/lib/auth";
import { getProductsByIds, isValidRecordId } from "@/lib/data";
import { mapOrder, mapOrderItem, mapReview } from "@/lib/pb/shared";
import { formatPrice, formatDate } from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/delivery";
import { decryptField } from "@/lib/crypto";
import { ORDER_STATUS_LABELS, type Product, type Review } from "@/lib/types";
import OrderStatusSteps from "@/components/order-status-steps";
import ReorderButton from "@/components/reorder-button";
import LeaveReview from "@/components/leave-review";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { session, pb } = await getSessionPb();
  if (!session.configured) redirect("/login");
  if (!session.userId) redirect("/login");
  if (!isValidRecordId(params.id)) notFound();

  // Правила PocketBase отдают заказ только владельцу/админу.
  const record = await pb
    .collection("orders")
    .getOne(params.id)
    .catch(() => null);
  if (!record || record.user !== session.userId) notFound();

  const itemRecords = await pb
    .collection("order_items")
    .getFullList({ filter: pb.filter("order = {:id}", { id: record.id }) })
    .catch(() => []);
  const order = mapOrder(record, itemRecords.map(mapOrderItem));
  const items = order.order_items ?? [];

  // Текущие товары (для картинок и кнопки «заказать ещё раз»).
  const ids = items.map((i) => i.product_id).filter((x): x is string => !!x);
  const productMap = new Map<string, Product>();
  if (ids.length) {
    const prods = await getProductsByIds(ids);
    for (const p of prods) productMap.set(p.id, p);
  }

  const imgOf = (pid: string | null) => {
    const p = pid ? productMap.get(pid) : null;
    return p?.image_url || p?.images?.[0] || null;
  };
  const goods = items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = order.delivery_cost ?? Math.max(0, order.total - goods);

  // Отзыв к этому заказу (если уже оставлен).
  const reviewRecord = await pb
    .collection("reviews")
    .getFirstListItem(
      pb.filter("order = {:order} && user = {:user}", {
        order: order.id,
        user: session.userId,
      })
    )
    .catch(() => null);
  const myReview: Review | null = reviewRecord ? mapReview(reviewRecord) : null;
  const canReview = order.status === "shipped" || order.status === "done";

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
        <span className="text-brand-700">Заказ #{order.number}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Заказ #{order.number}</h1>
          <p className="text-sm text-brand-500">
            от {formatDate(order.created_at)} ·{" "}
            <span className="font-semibold text-brand-700">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            {order.payment_status === "paid" &&
              ((order.refunded_amount ?? 0) > 0 ? (
                <span className="ml-2 badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                  Оплачен · частичный возврат
                </span>
              ) : (
                <span className="ml-2 badge bg-brand-600 text-white">Оплачен</span>
              ))}
            {order.payment_status === "refunded" && (
              <span className="ml-2 badge bg-brand-200 text-brand-700">Возврат оплаты</span>
            )}
          </p>
        </div>
        <ReorderButton items={reorderItems} />
      </div>

      {/* Прогресс */}
      <div className="card p-5">
        <OrderStatusSteps status={order.status} />
      </div>

      {/* Трек-номер отправления */}
      {order.tracking_number && (
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="text-sm text-brand-500">Трек-номер отправления</div>
            <div className="select-all text-lg font-bold tracking-wide text-brand-800">
              {order.tracking_number}
            </div>
          </div>
          <a
            href={`https://www.pochta.ru/tracking#${encodeURIComponent(order.tracking_number)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Отследить на Почте России
          </a>
        </div>
      )}

      {/* min-w-0 — чтобы грид мог ужать колонки под узкий экран. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Товары */}
        <div className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-brand-800">
            Состав заказа
          </h2>
          <div className="space-y-3">
            {items.map((it) => {
              const img = imgOf(it.product_id);
              const slug = it.product_id
                ? productMap.get(it.product_id)?.slug
                : null;
              const refunded = it.refunded_qty ?? 0;
              const fullRefund = refunded >= it.qty;
              const card = (
                <div className={`card flex items-center gap-4 p-3 ${fullRefund ? "opacity-75" : ""}`}>
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                    {img && (
                      <Image
                        src={img}
                        alt=""
                        fill
                        sizes="80px"
                        className={`object-cover ${fullRefund ? "grayscale" : ""}`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold text-brand-800 ${fullRefund ? "line-through" : ""}`}>
                        {it.name}
                      </span>
                      {refunded > 0 && (
                        <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                          ↩ {fullRefund ? "Возврат оформлен" : `Возврат ${refunded} из ${it.qty}`}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-brand-500">
                      {formatPrice(it.price)} × {it.qty}
                    </div>
                    {refunded > 0 && (
                      <div className="text-xs font-semibold text-amber-700">
                        Возвращено {formatPrice(it.price * refunded)} — деньги вернутся на карту в течение 1–10 дней
                      </div>
                    )}
                  </div>
                  <div className={`whitespace-nowrap font-bold ${fullRefund ? "text-brand-400 line-through" : "text-brand-700"}`}>
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
        <div className="min-w-0 space-y-4">
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
              {(order.refunded_amount ?? 0) > 0 && (
                <div className="flex justify-between font-semibold text-amber-700">
                  <span>Возвращено</span>
                  <span>−{formatPrice(order.refunded_amount ?? 0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5 text-sm text-brand-700">
            <h3 className="mb-3 font-bold text-brand-800">Доставка</h3>
            <div><span className="text-brand-500">Получатель:</span> {order.customer_name}</div>
            <div><span className="text-brand-500">Телефон:</span> {decryptField(order.phone)}</div>
            <div className="mt-1"><span className="text-brand-500">Адрес:</span> {decryptField(order.address)}</div>
            {order.comment && (
              <div className="mt-1"><span className="text-brand-500">Комментарий:</span> {order.comment}</div>
            )}
          </div>
        </div>
      </div>

      {/* Отзыв о заказе */}
      <div className="mt-6">
        <LeaveReview
          orderId={order.id}
          canReview={canReview}
          defaultName={order.customer_name}
          existing={myReview}
        />
      </div>
    </div>
  );
}
