import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import Stars from "@/components/stars";
import ReviewModeration from "@/components/admin/review-moderation";
import type { Review, ReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-brand-600 text-white",
  rejected: "bg-accent-500/15 text-accent-700",
};
const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "На модерации",
  approved: "Опубликован",
  rejected: "Отклонён",
};

export default async function AdminReviews() {
  const supabase = createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, author_name, rating, text, status, created_at, order_id, user_id")
    .order("created_at", { ascending: false });

  const reviews = (data ?? []) as Review[];
  // На модерации — наверх.
  reviews.sort(
    (a, b) =>
      (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1)
  );
  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Отзывы ({reviews.length}){" "}
        {pendingCount > 0 && (
          <span className="badge bg-amber-100 text-amber-700">
            на модерации: {pendingCount}
          </span>
        )}
      </h2>

      {reviews.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          Отзывов пока нет.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Stars value={r.rating} />
                  <div className="mt-1 text-sm font-semibold text-brand-800">
                    {r.author_name || "Покупатель"}
                  </div>
                  <div className="text-xs text-brand-500">
                    {formatDate(r.created_at)}
                    {r.order_id ? ` · заказ #${r.order_id}` : ""}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-brand-700">
                {r.text}
              </p>
              <div className="mt-4">
                <ReviewModeration id={r.id} status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
