import Link from "next/link";
import Image from "next/image";
import { createServerPb } from "@/lib/pb/server";
import { fetchOrdersWithItems } from "@/lib/orders";
import { getProductsByIds } from "@/lib/data";
import { formatPrice, formatDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";
import type { Order, OrderStatus, PaymentStatus, Product } from "@/lib/types";
import OrderStatusSelect from "@/components/admin/order-status-select";
import DeleteButton from "@/components/admin/delete-button";
import { deleteOrder } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

// Плюральные подписи для фильтра (в статусах заказа — единственное число).
const FILTER_LABELS: Record<OrderStatus, string> = {
  new: "Новые",
  processing: "В обработке",
  shipped: "Отправлены",
  done: "Выполнены",
  cancelled: "Отменены",
};

const PAYMENT_BADGE: Partial<Record<PaymentStatus, { label: string; cls: string }>> = {
  pending: { label: "Ждёт оплаты", cls: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  paid: { label: "Оплачен", cls: "bg-brand-600 text-white" },
  failed: { label: "Оплата не прошла", cls: "bg-accent-500/15 text-accent-700" },
  refunded: { label: "Возврат", cls: "bg-brand-200 text-brand-700" },
};

export default async function AdminOrders({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; pay?: string };
}) {
  // Клиент с токеном админа из cookie — правила PocketBase дают видеть всё.
  const pb = createServerPb();
  let orders: Order[] = [];
  try {
    orders = await fetchOrdersWithItems(pb);
  } catch {
    orders = [];
  }

  const statusParam = searchParams?.status ?? "";
  const status = (Object.keys(FILTER_LABELS) as OrderStatus[]).includes(
    statusParam as OrderStatus
  )
    ? (statusParam as OrderStatus)
    : null;
  const q = (searchParams?.q ?? "").trim();
  // Отдельный фильтр «не оплачены»: заказ с онлайн-оплатой попадает в базу
  // сразу при оформлении, и покупатель может завершить оплату позже.
  const unpaidOnly = searchParams?.pay === "unpaid";
  const isUnpaid = (o: Order) =>
    o.payment_status === "pending" || o.payment_status === "failed";

  const counts = new Map<OrderStatus, number>();
  for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  const unpaidCount = orders.filter(isUnpaid).length;

  let filtered = status ? orders.filter((o) => o.status === status) : orders;
  if (unpaidOnly) filtered = filtered.filter(isUnpaid);
  if (q) {
    // Нормализация как в каталоге: регистр и ё/е искать не мешают.
    const needle = normalizeSearch(q.replace(/^#/, ""));
    filtered = filtered.filter(
      (o) =>
        String(o.number).includes(needle) ||
        normalizeSearch(o.customer_name).includes(needle) ||
        normalizeSearch(o.tracking_number ?? "").includes(needle)
    );
  }

  // Картинки товаров для миниатюр состава (первые ~3 позиции каждого заказа).
  const productIds = Array.from(
    new Set(
      filtered.flatMap((o) =>
        (o.order_items ?? [])
          .slice(0, 4)
          .map((i) => i.product_id)
          .filter((x): x is string => !!x)
      )
    )
  );
  const productMap = new Map<string, Product>();
  if (productIds.length) {
    const prods = await getProductsByIds(productIds);
    for (const p of prods) productMap.set(p.id, p);
  }
  const imgOf = (pid: string | null) => {
    const p = pid ? productMap.get(pid) : null;
    return p?.image_url || p?.images?.[0] || null;
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active
        ? "border-transparent bg-brand-600 text-white"
        : "border-brand-200 bg-surface text-brand-700 hover:bg-brand-100"
    }`;
  const withParams = (s: OrderStatus | null, pay = unpaidOnly) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (pay) p.set("pay", "unpaid");
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand-800">
          Заказы <span className="text-brand-400">({filtered.length})</span>
        </h2>
        <form action="/admin/orders" className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Номер, имя или трек"
            className="input !w-56 !py-1.5 text-sm"
          />
          <button type="submit" className="btn-outline !py-1.5">
            Найти
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={withParams(null)} className={chip(!status)}>
          Все · {orders.length}
        </Link>
        {(Object.keys(FILTER_LABELS) as OrderStatus[]).map((s) => (
          <Link key={s} href={withParams(s)} className={chip(status === s)}>
            {FILTER_LABELS[s]} · {counts.get(s) ?? 0}
          </Link>
        ))}
        <Link
          href={withParams(status, !unpaidOnly)}
          className={`${chip(unpaidOnly)} ml-auto`}
        >
          💳 Не оплачены · {unpaidCount}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          {orders.length === 0
            ? "Заказов пока нет."
            : "По выбранному фильтру заказов не нашлось."}
        </div>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {filtered.map((o) => {
            const items = o.order_items ?? [];
            const qty = items.reduce((s, i) => s + i.qty, 0);
            const thumbs = items.slice(0, 3);
            const rest = items.length - thumbs.length;
            // Частичный возврат: заказ оплачен, но часть денег уже вернули.
            const refunded = o.refunded_amount ?? 0;
            const pay =
              o.payment_status === "paid" && refunded > 0
                ? { label: `↩ Возврат ${formatPrice(refunded)}`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" }
                : PAYMENT_BADGE[o.payment_status ?? "unpaid"];
            return (
              <li key={o.id} className="relative">
                {/* «Растянутая» ссылка: клик по строке открывает заказ,
                    селект статуса перекрывает её через z-10. */}
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="absolute inset-0"
                  aria-label={`Открыть заказ №${o.number}`}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition hover:bg-brand-100/40">
                  <div className="w-24 shrink-0">
                    <div className="font-bold text-brand-800">#{o.number}</div>
                    <div className="text-xs text-brand-500">
                      {formatDate(o.created_at)}
                    </div>
                  </div>

                  <div className="flex shrink-0 -space-x-2">
                    {thumbs.map((it) => {
                      const img = imgOf(it.product_id);
                      return (
                        <div
                          key={it.id}
                          className="relative h-10 w-10 overflow-hidden rounded-lg bg-brand-100 ring-2 ring-surface"
                          title={it.name}
                        >
                          {img && (
                            <Image
                              src={img}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                    {rest > 0 && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-600 ring-2 ring-surface">
                        +{rest}
                      </div>
                    )}
                  </div>

                  {/* min-w заставляет блок переноситься на свою строку на
                      узких экранах вместо усечения имени до пары букв. */}
                  <div className="min-w-[10rem] flex-1">
                    <div className="truncate font-semibold text-brand-800">
                      {o.customer_name}
                    </div>
                    <div className="truncate text-xs text-brand-500">
                      {items.length} поз. · {qty} шт
                      {o.tracking_number ? ` · трек ${o.tracking_number}` : ""}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-brand-800">
                      {formatPrice(o.total)}
                    </div>
                    {pay && (
                      <span className={`badge mt-0.5 whitespace-nowrap ${pay.cls}`}>
                        {pay.label}
                      </span>
                    )}
                  </div>

                  <div className="relative z-10 flex items-center gap-2">
                    <OrderStatusSelect id={o.id} status={o.status} />
                    <DeleteButton
                      action={deleteOrder.bind(null, o.id)}
                      confirmText={`Точно удалить заказ #${o.number} вместе с составом из базы? Действие необратимо.`}
                      title={`Удалить заказ #${o.number}`}
                    />
                  </div>

                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5 shrink-0 text-brand-300"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L10.94 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
