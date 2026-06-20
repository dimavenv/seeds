import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { formatPrice, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus, type Product } from "@/lib/types";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<OrderStatus, string> = {
  new: "bg-brand-100 text-brand-700",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-sky-100 text-sky-700",
  done: "bg-brand-600 text-white",
  cancelled: "bg-accent-500/15 text-accent-700",
};

export default async function AccountPage() {
  const session = await getSession();

  if (!session.configured) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold text-brand-800">
            Личный кабинет недоступен
          </h1>
          <p className="mt-2 text-brand-600">
            Не настроен Supabase. Укажите ключи в <code className="rounded bg-brand-100 px-1">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!session.userId) {
    redirect("/login");
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, total, status, created_at, order_items(id, product_id, name, price, qty)"
    )
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  // Картинки товаров для миниатюр в истории.
  const ids = orders
    .flatMap((o) => (o.order_items ?? []).map((i) => i.product_id))
    .filter((x): x is number => !!x);
  const imgMap = new Map<number, string | null>();
  if (ids.length) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, image_url, images")
      .in("id", Array.from(new Set(ids)));
    for (const p of (prods ?? []) as Product[])
      imgMap.set(p.id, p.image_url || p.images?.[0] || null);
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
                    <div className="font-bold text-brand-800">Заказ #{o.id}</div>
                    <div className="text-sm text-brand-500">
                      {formatDate(o.created_at)} · {count} тов.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
                    return (
                      <div
                        key={it.id}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50"
                        title={it.name}
                      >
                        {img && (
                          <Image src={img} alt="" fill sizes="56px" className="object-cover" />
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
