import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";
import { formatDate } from "@/lib/format";
import Stars from "@/components/stars";
import type { Review } from "@/lib/types";

export const metadata: Metadata = { title: "Отзывы — Tomat Semena" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  let reviews: Review[] = [];
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase
      .from("reviews")
      .select("id, author_name, rating, text, status, created_at, order_id, user_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
    reviews = (data ?? []) as Review[];
  }

  const avg =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  return (
    <div className="container-page py-12">
      <h1 className="text-center text-3xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-4xl">
        Отзывы <span className="text-accent-500">покупателей</span>
      </h1>
      {avg && (
        <p className="mt-3 text-center text-brand-600">
          Средняя оценка <span className="font-bold text-brand-800">{avg}</span>{" "}
          из 5 · {reviews.length} отзыв(ов)
        </p>
      )}

      {reviews.length === 0 ? (
        <div className="card mx-auto mt-8 max-w-lg p-8 text-center">
          <div className="text-3xl">🌱</div>
          <p className="mt-3 text-brand-600">
            Здесь скоро появятся отзывы. Оставить отзыв можно из истории заказа
            после получения.
          </p>
          <Link href="/catalog" className="btn-primary mt-5">
            В каталог
          </Link>
        </div>
      ) : (
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <div
              key={r.id}
              style={{ animationDelay: `${(i % 6) * 70}ms` }}
              className="card flex flex-col p-5 motion-safe:animate-fade-up"
            >
              <Stars value={r.rating} />
              <p className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-brand-700">
                {r.text}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-3 text-xs">
                <span className="font-semibold text-brand-800">
                  {r.author_name || "Покупатель"}
                </span>
                <span className="text-brand-400">{formatDate(r.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
