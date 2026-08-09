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
import AccountSettings from "@/components/account-settings";
import PayOrderButton from "@/components/pay-order-button";
import CancelOrderButton from "@/components/cancel-order-button";
import { EMPTY_PROFILE, profileFromRecord, type Profile } from "@/lib/profile";
import { servicePageMetadata } from "@/lib/seo";

export const metadata = servicePageMetadata("/account", "Личный кабинет");

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<OrderStatus, string> = {
  new: "bg-brand-100 text-brand-700",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  shipped: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  done: "bg-brand-600 text-white",
  cancelled: "bg-accent-500/15 text-accent-700",
};

// Инициалы для кружка-аватара: «Иванов Иван» → «ИИ».
function initials(profile: Profile, email: string | null): string {
  const letters = [profile.first_name, profile.last_name]
    .map((s) => s.trim()[0])
    .filter(Boolean)
    .join("");
  return (letters || email?.[0] || "?").toUpperCase();
}

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

  // ФИО и телефон покупателя. База может быть без этих полей (схему на сервере
  // ещё не обновляли) — тогда просто показываем пустую форму.
  let profile: Profile = EMPTY_PROFILE;
  let autoPassword = false;
  try {
    const me = await pb.collection("users").getOne(session.userId);
    profile = profileFromRecord(me as unknown as Record<string, unknown>);
    autoPassword = Boolean(me.auto_password);
  } catch {
    profile = EMPTY_PROFILE;
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

  // Ждут оплаты: отменённые сюда не попадают — платить по ним уже нечего.
  const needsPayment = (o: Order) =>
    (o.payment_status === "pending" || o.payment_status === "failed") &&
    o.status !== "cancelled";
  const awaitingPayment = orders.filter(needsPayment);
  const displayName =
    [profile.last_name, profile.first_name].filter(Boolean).join(" ") ||
    session.email ||
    "Покупатель";

  return (
    <div className="container-page py-8">
      {/* ===== Шапка кабинета ===== */}
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xl font-bold text-white"
        >
          {initials(profile, session.email)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-brand-800">
            {displayName}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-brand-500">
            <span className="truncate">{session.email}</span>
            <span className="badge bg-brand-100 text-brand-700">
              {session.isAdmin ? "Администратор" : "Покупатель"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Заказы, которые ждут оплаты, — самое срочное, поэтому в самом верху. */}
      {awaitingPayment.length > 0 && (
        <div className="mb-6 rounded-2xl border border-accent-500/30 bg-accent-500/5 p-5">
          <h2 className="text-base font-bold text-brand-800">
            {awaitingPayment.length === 1
              ? "Заказ ждёт оплаты"
              : `Заказы ждут оплаты: ${awaitingPayment.length}`}
          </h2>
          <p className="mt-1 text-sm text-brand-600">
            Оплата не завершилась — заказ сохранён, оплатить его можно прямо
            отсюда. Товар придерживается 20 минут с последней попытки, дальше
            возвращается в продажу, но заказ остаётся.
          </p>
          <ul className="mt-4 space-y-3">
            {awaitingPayment.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3"
              >
                <div>
                  <Link
                    href={`/account/orders/${o.id}`}
                    className="font-bold text-brand-800 hover:text-brand-600"
                  >
                    Заказ #{o.number}
                  </Link>
                  <div className="text-sm text-brand-500">
                    {formatDate(o.created_at)} · {formatPrice(o.total)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <CancelOrderButton orderId={o.id} />
                  <PayOrderButton orderId={o.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== Настройки: раскрываются по кнопке ===== */}
      <AccountSettings
        email={session.email}
        profile={profile}
        autoPassword={autoPassword}
      />

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
            const unpaid = needsPayment(o);
            return (
              <div key={o.id} className="card p-5 transition hover:border-brand-300 hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/account/orders/${o.id}`}
                      className="font-bold text-brand-800 hover:text-brand-600"
                    >
                      Заказ #{o.number}
                    </Link>
                    <div className="text-sm text-brand-500">
                      {formatDate(o.created_at)} · {count} тов.
                    </div>
                    {o.tracking_number && (
                      <div className="mt-0.5 text-xs text-brand-500">
                        📮 Трек: <span className="font-semibold text-brand-700">{o.tracking_number}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {unpaid && (
                      <span className="badge bg-accent-500/15 text-accent-700">
                        ● Не оплачен
                      </span>
                    )}
                    {o.payment_status === "refunded" && (
                      <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">↩ Возврат оплаты</span>
                    )}
                    {o.payment_status === "paid" && (o.refunded_amount ?? 0) > 0 && (
                      <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
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
                          <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
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
                  <div className="ml-auto flex flex-wrap items-center gap-4">
                    {unpaid && (
                      <>
                        <CancelOrderButton orderId={o.id} />
                        <PayOrderButton orderId={o.id} />
                      </>
                    )}
                    <Link
                      href={`/account/orders/${o.id}`}
                      className="text-sm font-semibold text-brand-600 hover:text-brand-800"
                    >
                      Подробнее →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
