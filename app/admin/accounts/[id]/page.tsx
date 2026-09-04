import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerPb } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { fetchAccount } from "@/lib/accounts";
import { fetchOrdersWithItems } from "@/lib/orders";
import { isValidRecordId } from "@/lib/data";
import { formatPrice, formatDate } from "@/lib/format";
import { formatPhone, joinFullName } from "@/lib/profile";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type Order } from "@/lib/types";
import AccountActions from "@/components/admin/account-actions";

export const metadata = { title: "Аккаунт" };
export const dynamic = "force-dynamic";

export default async function AdminAccount({
  params,
}: {
  params: { id: string };
}) {
  if (!isValidRecordId(params.id)) notFound();

  const pb = createServerPb();
  const [account, session] = await Promise.all([
    fetchAccount(pb, params.id),
    getSession(),
  ]);
  if (!account) notFound();

  // Заказы этого покупателя. Правила PocketBase отдают админу всё, фильтр —
  // чтобы не тащить лишнее.
  let orders: Order[] = [];
  try {
    orders = await fetchOrdersWithItems(pb, {
      ordersFilter: pb.filter("user = {:uid}", { uid: account.id }),
      itemsFilter: pb.filter("order.user = {:uid}", { uid: account.id }),
    });
  } catch {
    orders = [];
  }

  const fullName = joinFullName(account.profile);
  const isSelf = account.id === session.userId;
  const protectedAccount = isSelf || account.isAdmin;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-2 border-b border-brand-100 py-2 last:border-0">
      <span className="text-sm text-brand-500">{label}</span>
      <span className="text-sm font-medium text-brand-800">{value}</span>
    </div>
  );

  return (
    <div>
      <nav className="mb-4 text-sm text-brand-500">
        <Link href="/admin/accounts" className="hover:text-brand-700">
          Аккаунты
        </Link>
        <span className="mx-1.5">/</span>
        <span className="break-all text-brand-700">{account.email}</span>
      </nav>

      {account.blocked && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-500/30 bg-accent-500/5 p-4">
          <span aria-hidden="true" className="text-xl">🔒</span>
          <div>
            <div className="font-bold text-brand-800">Аккаунт заблокирован</div>
            <div className="text-sm text-brand-600">
              {account.blockedReason || "Причина не указана."} Покупатель видит
              это в личном кабинете и не может оформлять заказы.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ===== Данные ===== */}
        <div className="card min-w-0 p-5 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-brand-800">
            {fullName || "Без имени"}
          </h2>
          {row("Email", <span className="break-all">{account.email}</span>)}
          {row(
            "Телефон",
            account.profile.phone ? formatPhone(account.profile.phone) : "—"
          )}
          {row("ФИО", fullName || "—")}
          {row(
            "Роль",
            account.isAdmin ? "Администратор" : "Покупатель"
          )}
          {row(
            "Почта подтверждена",
            account.verified ? "да" : "нет"
          )}
          {row(
            "Пароль",
            account.autoPassword
              ? "выдан сайтом после оплаты, покупатель его не менял"
              : "задан покупателем"
          )}
          {row(
            "Аккаунт создан",
            account.createdAt ? formatDate(account.createdAt) : "—"
          )}
          {row(
            "Заказы",
            account.ordersCount > 0
              ? `${account.ordersCount} на ${formatPrice(account.ordersTotal)}`
              : "нет"
          )}
          {account.lastOrderAt &&
            row("Последний заказ", formatDate(account.lastOrderAt))}
        </div>

        {/* ===== Действия ===== */}
        <div className="card h-fit min-w-0 p-5">
          <h2 className="mb-3 text-lg font-bold text-brand-800">Действия</h2>
          <AccountActions
            id={account.id}
            email={account.email}
            blocked={account.blocked}
            reason={account.blockedReason}
            disabled={protectedAccount}
            disabledHint={
              isSelf
                ? "Это ваш аккаунт — заблокировать или удалить его отсюда нельзя."
                : "Аккаунт администратора. Снять права можно только в админке PocketBase."
            }
          />
        </div>
      </div>

      {/* ===== Заказы ===== */}
      <h2 className="mb-3 mt-8 text-lg font-bold text-brand-800">
        Заказы <span className="text-brand-400">({orders.length})</span>
      </h2>
      {orders.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          У этого аккаунта нет заказов.
        </div>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {orders.map((o) => {
            const items = o.order_items ?? [];
            const qty = items.reduce((s, i) => s + i.qty, 0);
            return (
              <li key={o.id} className="relative">
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="absolute inset-0"
                  aria-label={`Открыть заказ №${o.number}`}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition hover:bg-brand-100/40">
                  <div className="w-24 shrink-0">
                    <div className="font-bold text-brand-800">#{o.number}</div>
                    <div className="text-xs text-brand-500">
                      {formatDate(o.created_at)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 truncate text-sm text-brand-600">
                    {qty} тов.
                    {items.length > 0 && (
                      <span className="text-brand-400">
                        {" "}
                        · {items.map((i) => i.name).join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="badge bg-brand-100 text-brand-700">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                  <span className="text-xs text-brand-500">
                    {PAYMENT_STATUS_LABELS[o.payment_status ?? "unpaid"]}
                  </span>
                  <span className="w-24 shrink-0 text-right font-extrabold text-brand-700">
                    {formatPrice(o.total)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
