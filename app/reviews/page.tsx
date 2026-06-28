import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";
import { formatDate } from "@/lib/format";
import Stars from "@/components/stars";
import type { Review } from "@/lib/types";

export const metadata: Metadata = { title: "Отзывы — Tomat Semena" };
export const dynamic = "force-dynamic";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-brand-600 text-white",
  "bg-accent-500 text-white",
  "bg-amber-500 text-white",
  "bg-teal-600 text-white",
  "bg-violet-600 text-white",
];

export default async function ReviewsPage() {
  let reviews: Review[] = [];
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase
      .from("reviews")
      .select("id, author_name, rating, text, status, source, created_at, order_id, user_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
    reviews = (data ?? []) as Review[];
  }

  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: reviews.filter((r) => r.rating === n).length,
  }));

  return (
    <div className="container-page py-12">
      {/* Заголовок */}
      <div className="mx-auto max-w-5xl">
        <h1 className="text-center text-3xl font-extrabold text-brand-800 sm:text-4xl">
          Отзывы{" "}
          <span className="text-accent-500">покупателей</span>
        </h1>

        {avg && reviews.length > 0 && (
          <div className="mx-auto mt-8 flex max-w-sm flex-col items-center rounded-2xl bg-brand-50 p-6 shadow-sm">
            <div className="text-5xl font-black text-brand-800">{avg}</div>
            <Stars value={Math.round(Number(avg))} className="mt-2 text-2xl" />
            <p className="mt-2 text-sm text-brand-500">
              на основе {reviews.length} отзыв{reviews.length === 1 ? "а" : reviews.length < 5 ? "ов" : "ов"}
            </p>
            <div className="mt-4 w-full space-y-1.5">
              {dist.map(({ n, count }) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-right text-brand-600">{n}</span>
                  <span className="text-amber-400">★</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-2 rounded-full bg-amber-400 transition-all"
                      style={{ width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="w-4 text-brand-500">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="card mx-auto mt-8 max-w-lg p-8 text-center">
            <div className="text-4xl">🌱</div>
            <p className="mt-3 text-brand-600">
              Здесь скоро появятся отзывы. Оставить отзыв можно из истории
              заказа после получения.
            </p>
            <Link href="/catalog" className="btn-primary mt-5">
              В каталог
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => {
              const name = r.author_name || "Покупатель";
              const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
              const isOzon = r.source === "ozon";
              return (
                <div
                  key={r.id}
                  style={{ animationDelay: `${(i % 6) * 70}ms` }}
                  className="card flex flex-col gap-3 p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-fade-up"
                >
                  {/* Шапка карточки: аватар + имя + дата */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor}`}
                    >
                      {initials(name) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-brand-800">
                          {name}
                        </span>
                        {isOzon && (
                          <span
                            className="group relative cursor-default"
                            title=""
                          >
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                              Ozon
                            </span>
                            {/* Тултип */}
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-xl bg-brand-800 px-3 py-2 text-center text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              Данный отзыв был перенесён с&nbsp;Ozon
                              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-brand-800" />
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-brand-400">
                        {formatDate(r.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Звёзды */}
                  <Stars value={r.rating} />

                  {/* Текст с кавычкой */}
                  <div className="relative flex-1 pl-4">
                    <span className="absolute left-0 top-0 text-2xl font-black leading-none text-accent-500/30">
                      "
                    </span>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-700">
                      {r.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
