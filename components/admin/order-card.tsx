"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPrice, formatDate } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import OrderStatusBadge from "@/components/admin/order-status-badge";
import OrderStatusSelect from "@/components/admin/order-status-select";
import OrderTrackingInput from "@/components/admin/order-tracking-input";

// Плоская форма заказа для админки: поля клиента уже расшифрованы на сервере.
export type AdminOrderItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
  image_url: string | null;
  slug: string | null;
};

export type AdminOrder = {
  id: number;
  created_at: string;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  comment: string | null;
  status: OrderStatus;
  total: number;
  delivery_label: string | null;
  delivery_cost: number | null;
  tracking_number: string | null;
  items: AdminOrderItem[];
};

// «5 товаров», «2 товара», «1 товар»
function itemsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "товаров";
  if (mod10 === 1 && mod100 !== 11) word = "товар";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "товара";
  return `${n} ${word}`;
}

function Thumb({ item, size }: { item: AdminOrderItem; size: number }) {
  return item.image_url ? (
    <Image
      src={item.image_url}
      alt={item.name}
      width={size}
      height={size}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-lg">🌱</span>
  );
}

export default function OrderCard({
  order,
  defaultOpen = false,
}: {
  order: AdminOrder;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const qtyTotal = order.items.reduce((s, it) => s + it.qty, 0);

  return (
    <div className="card overflow-hidden">
      {/* Шапка — кликабельная, раскрывает заказ */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left transition hover:bg-brand-50/60 sm:p-5"
      >
        <div className="min-w-[9rem]">
          <div className="text-lg font-bold text-brand-800">Заказ #{order.id}</div>
          <div className="text-sm text-brand-500">{formatDate(order.created_at)}</div>
        </div>

        <div className="hidden items-center md:flex">
          {order.items.slice(0, 3).map((it) => (
            <span
              key={it.id}
              className="-ml-2 h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-brand-50 ring-2 ring-surface first:ml-0"
            >
              <Thumb item={it} size={44} />
            </span>
          ))}
          {order.items.length > 3 && (
            <span className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-xs font-bold text-brand-600 ring-2 ring-surface">
              +{order.items.length - 3}
            </span>
          )}
          <span className="ml-3 text-sm text-brand-500">{itemsLabel(qtyTotal)}</span>
        </div>

        <div className="min-w-0 flex-1 truncate text-sm text-brand-700">
          {order.customer_name}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-lg font-extrabold text-brand-700">
            {formatPrice(order.total)}
          </span>
          <OrderStatusBadge status={order.status} />
          <svg
            viewBox="0 0 20 20"
            className={`h-5 w-5 text-brand-400 transition ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="grid gap-6 border-t border-brand-100 p-4 sm:p-5 lg:grid-cols-[1fr,20rem] motion-safe:animate-fade-in">
          {/* Состав заказа */}
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-500">
              Состав заказа
            </h3>
            <ul className="divide-y divide-brand-100">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                    <Thumb item={it} size={56} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {it.slug ? (
                      <Link
                        href={`/product/${it.slug}`}
                        className="line-clamp-2 text-sm font-semibold text-brand-800 hover:text-brand-600"
                      >
                        {it.name}
                      </Link>
                    ) : (
                      <div className="line-clamp-2 text-sm font-semibold text-brand-800">
                        {it.name}
                      </div>
                    )}
                    <div className="text-sm text-brand-500">
                      {it.qty} × {formatPrice(it.price)}
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-sm font-bold text-brand-800">
                    {formatPrice(it.price * it.qty)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-brand-100 pt-3 text-sm">
              {order.delivery_label && (
                <div className="flex justify-between text-brand-600">
                  <span>Доставка: {order.delivery_label}</span>
                  <span>{order.delivery_cost ? formatPrice(order.delivery_cost) : "—"}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-brand-800">
                <span>Итого</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Клиент и управление */}
          <div className="space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-500">
                Клиент
              </h3>
              <dl className="space-y-1.5 text-sm text-brand-700">
                <div>
                  <dt className="inline text-brand-500">Имя: </dt>
                  <dd className="inline font-semibold">{order.customer_name}</dd>
                </div>
                <div>
                  <dt className="inline text-brand-500">Телефон: </dt>
                  <dd className="inline">
                    <a href={`tel:${order.phone}`} className="hover:text-brand-900">
                      {order.phone}
                    </a>
                  </dd>
                </div>
                {order.email && (
                  <div>
                    <dt className="inline text-brand-500">Email: </dt>
                    <dd className="inline">
                      <a href={`mailto:${order.email}`} className="hover:text-brand-900">
                        {order.email}
                      </a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-brand-500">Адрес: </dt>
                  <dd className="inline">{order.address}</dd>
                </div>
                {order.comment && (
                  <div>
                    <dt className="inline text-brand-500">Комментарий: </dt>
                    <dd className="inline">{order.comment}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-500">
                Управление
              </h3>
              <div className="flex flex-col items-start gap-3">
                <OrderStatusSelect id={order.id} status={order.status} />
                <OrderTrackingInput id={order.id} tracking={order.tracking_number} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
