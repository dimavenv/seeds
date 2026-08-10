import Link from "next/link";
import { createServerPb } from "@/lib/pb/server";
import { fetchAccounts, accountHaystack, type Account } from "@/lib/accounts";
import { formatPrice, formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/profile";

export const metadata = { title: "Аккаунты" };
export const dynamic = "force-dynamic";

// Аккаунты покупателей: кто зарегистрирован, сколько заказал, кто заблокирован.
export default async function AdminAccounts({
  searchParams,
}: {
  searchParams?: { q?: string; filter?: string };
}) {
  const pb = createServerPb();
  const accounts = await fetchAccounts(pb).catch(() => [] as Account[]);

  const q = (searchParams?.q ?? "").trim();
  const filter = searchParams?.filter ?? "";

  let shown = accounts;
  if (filter === "blocked") shown = shown.filter((a) => a.blocked);
  if (filter === "buyers") shown = shown.filter((a) => a.ordersCount > 0);
  if (q) {
    const needle = q.toLowerCase();
    shown = shown.filter((a) => accountHaystack(a).includes(needle));
  }

  const blockedCount = accounts.filter((a) => a.blocked).length;
  const buyersCount = accounts.filter((a) => a.ordersCount > 0).length;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active
        ? "border-transparent bg-brand-600 text-white"
        : "border-brand-200 bg-surface text-brand-700 hover:bg-brand-100"
    }`;
  const withFilter = (f: string) => {
    const p = new URLSearchParams();
    if (f) p.set("filter", f);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/accounts?${qs}` : "/admin/accounts";
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand-800">
          Аккаунты <span className="text-brand-400">({shown.length})</span>
        </h2>
        <form action="/admin/accounts" className="flex items-center gap-2">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Почта, имя или телефон"
            className="input !w-56 !py-1.5 text-sm"
          />
          <button type="submit" className="btn-outline !py-1.5">
            Найти
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={withFilter("")} className={chip(!filter)}>
          Все · {accounts.length}
        </Link>
        <Link href={withFilter("buyers")} className={chip(filter === "buyers")}>
          С заказами · {buyersCount}
        </Link>
        <Link href={withFilter("blocked")} className={chip(filter === "blocked")}>
          🔒 Заблокированы · {blockedCount}
        </Link>
      </div>

      {shown.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          {accounts.length === 0
            ? "Аккаунтов пока нет."
            : "По запросу ничего не нашлось."}
        </div>
      ) : (
        <ul className="card divide-y divide-brand-100">
          {shown.map((a) => {
            const name =
              [a.profile.last_name, a.profile.first_name]
                .filter(Boolean)
                .join(" ") || "—";
            return (
              <li key={a.id} className="relative">
                <Link
                  href={`/admin/accounts/${a.id}`}
                  className="absolute inset-0"
                  aria-label={`Открыть аккаунт ${a.email}`}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition hover:bg-brand-100/40">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                      a.blocked ? "bg-accent-500" : "bg-brand-500"
                    }`}
                  >
                    {(a.profile.first_name[0] || a.email[0] || "?").toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-brand-800">
                      {name}
                    </div>
                    <div className="truncate text-sm text-brand-500">
                      {a.email}
                    </div>
                  </div>

                  <div className="hidden w-40 shrink-0 text-sm text-brand-600 sm:block">
                    {a.profile.phone ? formatPhone(a.profile.phone) : "—"}
                  </div>

                  <div className="w-28 shrink-0 text-sm text-brand-600">
                    {a.ordersCount > 0 ? (
                      <>
                        {a.ordersCount} зак.
                        <div className="text-xs text-brand-400">
                          {formatPrice(a.ordersTotal)}
                        </div>
                      </>
                    ) : (
                      <span className="text-brand-400">без заказов</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {a.isAdmin && (
                      <span className="badge bg-brand-100 text-brand-700">
                        Админ
                      </span>
                    )}
                    {a.blocked && (
                      <span className="badge bg-accent-500/15 text-accent-700">
                        🔒 Заблокирован
                      </span>
                    )}
                  </div>

                  <div className="hidden w-24 shrink-0 text-right text-xs text-brand-400 lg:block">
                    {a.createdAt ? formatDate(a.createdAt) : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
