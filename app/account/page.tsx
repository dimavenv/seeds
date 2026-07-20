import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionPb } from "@/lib/auth";
import { fetchOrdersWithItems } from "@/lib/orders";
import { getProductsByIds } from "@/lib/data";
import { formatPrice, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/types";
import LogoutButton from "@/components/logout-button";
import ThemeToggle from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<OrderStatus, string> = {
  new: "bg-brand-100 text-brand-700",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-sky-100 text-sky-700",
  done: "bg-brand-600 text-white",
  cancelled: "bg-accent-500/15 text-accent-700",
};

export default async function AccountPage() {
  const { session, pb } = await getSessionPb();

  if (!session.configured) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-brand-800">
            Личный кабинет недоступен
          </h1>
          <p className="mt-2 text-brand-600">
            Не настроена база данных (PocketBase). Укажите ключи в{" "}
            <code className="rounded bg-brand-100 px-1">.env.production</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!session.userId) {
    redirect("/login");
  }

  // Правила PocketBase позволяют видеть только свои заказы; фильтр — для явности.
  let orders: Order[] = [];
  try {
    orders = await fetchOrdersWithItems(pb, {
      ordersFilter: pb.filter("user = {:uid}", { uid: session.userId }),
      itemsFilter: pb.filter("order.user = {:uid}", { uid: session.userId }),
    });
  } catch {
    orders = [];
  }

  // Картинки товаров для миниатюр в истории.
  const ids = orders
    .flatMap((o) => (o.order_items ?? []).map((i) => i.product_id))
    .filter((x): x is string => !!x);
  const imgMap = new Map<string, string | null>();
  if (ids.length) {
    const prods = await getProductsByIds(Array.from(new Set(ids)));
    for (const p of prods) imgMap.set(p.id, p.image_url || p.images?.[0] || null);
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Личный кабинет</h1>
          <p className="text-sm text-brand-500">
            {session.email}
            <span className="ml-2 badge bg-brand-100 text-brand-700">
              {session.isAdmin ? "Администратор" : "Покупатель"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-brand-200 pl-3 text-sm text-brand-600">
            Тема
            <ThemeToggle />
          </span>
          {session.isAdmin && (
            <Link href="/admin" className="btn-primary">
              Админ-панель
            </Link>
          )}
          <Link href="/favorites" className="btn-outline">
            Избранное
          </Link>
          <LogoutButton />
        </div>
      </div>

      <h2 className="mb-3 text-lg font-bold text-brand-800">История заказов</h2>

      {orders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-brand-600">У вас пока нет заказов.</p>
          <Link href="/catalog" className="btn-accent mt-4">
            Перейти в каталог
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const items = o.order_items ?? [];
            const count = items.reduce((s, i) => s + i.qty, 0);
            return (
              <Link
                key={o.id}
                href={`/account/orders/${o.id}`}
                className="card block p-5 transition hover:border-brand-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-brand-800">Заказ #{o.number}</div>
                    <div className="text-sm text-brand-500">
                      {formatDate(o.created_at)} · {count} тов.
                    </div>
                    {o.tracking_number && (
                      <div className="mt-0.5 text-xs text-brand-500">
                        📮 Трек: <span className="font-semibold text-brand-700">{o.tracking_number}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {o.payment_status === "refunded" && (
                      <span className="badge bg-amber-100 text-amber-700">↩ Возврат оплаты</span>
                    )}
                    {o.payment_status === "paid" && (o.refunded_amount ?? 0) > 0 && (
                      <span className="badge bg-amber-100 text-amber-700">
                        ↩ Возврат {formatPrice(o.refunded_amount ?? 0)}
                      </span>
                    )}
                    <span className={`badge ${STATUS_BADGE[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    <span className="text-lg font-extrabold text-brand-700">
                      {formatPrice(o.total)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-brand-100 pt-4">
                  {items.slice(0, 6).map((it) => {
                    const img = it.product_id ? imgMap.get(it.product_id) : null;
                    const refunded = (it.refunded_qty ?? 0) > 0;
                    return (
                      <div
                        key={it.id}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50"
                        title={refunded ? `${it.name} — возврат оформлен` : it.name}
                      >
                        {img && (
                          <Image
                            src={img}
                            alt=""
                            fill
                            sizes="56px"
                            className={`object-cover ${refunded ? "opacity-60 grayscale" : ""}`}
                          />
                        )}
                        {refunded && (
                          <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-amber-100 text-[11px] font-bold text-amber-700">
                            ↩
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {items.length > 6 && (
                    <span className="text-sm text-brand-500">
                      +{items.length - 6}
                    </span>
                  )}
                  <span className="ml-auto text-sm font-semibold text-brand-600">
                    Подробнее →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
