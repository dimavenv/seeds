import Link from "next/link";
import { thumbUrl } from "@/lib/image-variants";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createServerPb } from "@/lib/pb/server";
import { mapOrder, mapOrderItem } from "@/lib/pb/shared";
import { getProductsByIds, isValidRecordId } from "@/lib/data";
import { formatPrice, formatDate } from "@/lib/format";
import { deliveryMethodLabel } from "@/lib/delivery";
import { decryptField } from "@/lib/crypto";
import type { Product } from "@/lib/types";
import OrderStatusBadge from "@/components/admin/order-status-badge";
import OrderStatusSelect from "@/components/admin/order-status-select";
import OrderTrackingInput from "@/components/admin/order-tracking-input";
import OrderPayment from "@/components/admin/order-payment";
import { isRefundApiConfigured } from "@/lib/robokassa";
import DeleteButton from "@/components/admin/delete-button";
import { deleteOrder } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetail({
  params,
}: {
  params: { id: string };
}) {
  if (!isValidRecordId(params.id)) notFound();

  // Клиент с токеном админа из cookie — правила PocketBase дают видеть всё.
  const pb = createServerPb();
  const record = await pb
    .collection("orders")
    .getOne(params.id)
    .catch(() => null);
  if (!record) notFound();

  const itemRecords = await pb
    .collection("order_items")
    .getFullList({ filter: pb.filter("order = {:id}", { id: record.id }) })
    .catch(() => []);
  const order = mapOrder(record, itemRecords.map(mapOrderItem));
  const items = order.order_items ?? [];

  // Текущие товары — для картинок и ссылок на карточки.
  const ids = items.map((i) => i.product_id).filter((x): x is string => !!x);
  const productMap = new Map<string, Product>();
  if (ids.length) {
    const prods = await getProductsByIds(ids);
    for (const p of prods) productMap.set(p.id, p);
  }
  const imgOf = (pid: string | null) => {
    const p = pid ? productMap.get(pid) : null;
    // Миниатюра, а не оригинал: фото с телефона весит мегабайты, а показываем
    // мы его в квадратике на несколько десятков пикселей.
    return thumbUrl(p?.image_variants, p?.image_url || p?.images?.[0] || null);
  };

  const qty = items.reduce((s, i) => s + i.qty, 0);
  const goods = items.reduce((s, i) => s + i.price * i.qty, 0);
  // Запасной расчёт доставки — с учётом скидки: total = товары − скидка + доставка.
  const delivery =
    order.delivery_cost ??
    Math.max(0, order.total - goods + (order.discount ?? 0));
  const phone = decryptField(order.phone);
  const email = order.email ? decryptField(order.email) : null;
  const address = decryptField(order.address);

  return (
    <div>
      <nav className="mb-4 text-sm text-brand-500">
        <Link href="/admin/orders" className="hover:text-brand-700">
          ← Все заказы
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-brand-800">
            Заказ #{order.number}
            <OrderStatusBadge status={order.status} />
          </h2>
          <p className="mt-0.5 text-sm text-brand-500">
            оформлен {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderPayment
            id={order.id}
            invoiceId={order.invoice_id ?? undefined}
            apiRefund={isRefundApiConfigured()}
            status={order.payment_status ?? "unpaid"}
            total={order.total}
            refundedAmount={order.refunded_amount ?? 0}
            items={items.map((it) => ({
              id: it.id,
              name: it.name,
              price: it.price,
              qty: it.qty,
              refundedQty: it.refunded_qty ?? 0,
            }))}
          />
          <OrderStatusSelect id={order.id} status={order.status} />
          <OrderTrackingInput id={order.id} tracking={order.tracking_number ?? null} />
          <DeleteButton
            action={deleteOrder.bind(null, order.id)}
            confirmText={`Точно удалить заказ #${order.number} вместе с составом из базы? Действие необратимо.`}
            redirectTo="/admin/orders"
          >
            Удалить заказ
          </DeleteButton>
        </div>
      </div>

      {/* min-w-0 — чтобы грид мог ужать колонки под узкий экран. */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Состав заказа */}
        <div className="min-w-0 lg:col-span-2">
          <h3 className="mb-3 font-bold text-brand-800">
            Состав заказа{" "}
            <span className="font-normal text-brand-400">
              · {items.length} поз., {qty} шт
            </span>
          </h3>
          {items.length === 0 ? (
            <div className="card p-6 text-center text-sm text-brand-500">
              Позиции не найдены.
            </div>
          ) : (
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
                            ↩ {fullRefund ? "возврат" : `возврат ${refunded} из ${it.qty}`}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-brand-500">
                        {formatPrice(it.price)} × {it.qty}
                      </div>
                      {refunded > 0 && (
                        <div className="text-xs font-semibold text-amber-700">
                          Возвращено {formatPrice(it.price * refunded)}
                        </div>
                      )}
                    </div>
                    <div className={`whitespace-nowrap font-bold ${fullRefund ? "text-brand-400 line-through" : "text-brand-700"}`}>
                      {formatPrice(it.price * it.qty)}
                    </div>
                  </div>
                );
                return slug ? (
                  <Link
                    key={it.id}
                    href={`/product/${slug}`}
                    className="block transition hover:opacity-90"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={it.id}>{card}</div>
                );
              })}
            </div>
          )}

          {order.tracking_number && (
            <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
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
                className="btn-outline !py-2"
              >
                Отследить на Почте России
              </a>
            </div>
          )}
        </div>

        {/* Оплата и покупатель */}
        <div className="min-w-0 space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-bold text-brand-800">Оплата</h3>
            <div className="space-y-1.5 text-sm text-brand-700">
              <div className="flex justify-between">
                <span>Товары</span>
                <span>{formatPrice(goods)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  Доставка
                  {order.delivery_method &&
                    ` · ${deliveryMethodLabel(order.delivery_method)}`}
                </span>
                <span>{formatPrice(delivery)}</span>
              </div>
              {(order.discount ?? 0) > 0 && (
                <div className="flex justify-between font-semibold text-brand-600">
                  <span>
                    Скидка по промокоду
                    {order.promo_code ? ` ${order.promo_code}` : ""}
                  </span>
                  <span>−{formatPrice(order.discount ?? 0)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-brand-100 pt-2 text-base font-extrabold text-brand-800">
                <span>Итого</span>
                <span>{formatPrice(order.total)}</span>
              </div>
              {(order.refunded_amount ?? 0) > 0 && (
                <>
                  <div className="flex justify-between font-semibold text-amber-700">
                    <span>Возвращено покупателю</span>
                    <span>−{formatPrice(order.refunded_amount ?? 0)}</span>
                  </div>
                  {order.payment_status === "paid" && (
                    <div className="flex justify-between text-brand-500">
                      <span>Осталось по оплате</span>
                      <span>
                        {formatPrice(Math.max(0, order.total - (order.refunded_amount ?? 0)))}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card p-5 text-sm text-brand-700">
            <h3 className="mb-3 font-bold text-brand-800">Покупатель</h3>
            <div className="space-y-1.5">
              <div>
                <span className="text-brand-500">Имя:</span> {order.customer_name}
              </div>
              <div>
                <span className="text-brand-500">Телефон:</span>{" "}
                <a href={`tel:${phone}`} className="font-semibold hover:underline">
                  {phone}
                </a>
              </div>
              {email && (
                <div className="min-w-0">
                  <span className="text-brand-500">Email:</span>{" "}
                  <a
                    href={`mailto:${email}`}
                    className="break-all font-semibold hover:underline"
                  >
                    {email}
                  </a>
                </div>
              )}
              <div>
                <span className="text-brand-500">Адрес:</span> {address}
              </div>
              {order.comment && (
                <div className="rounded-xl bg-brand-100/60 p-3">
                  <span className="text-brand-500">Комментарий:</span> {order.comment}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
