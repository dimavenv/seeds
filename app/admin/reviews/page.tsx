import { createServerPb } from "@/lib/pb/server";
import { mapReview } from "@/lib/pb/shared";
import { formatDate } from "@/lib/format";
import Stars from "@/components/stars";
import ReviewModeration from "@/components/admin/review-moderation";
import CreateReviewForm from "@/components/admin/create-review-form";
import DeleteButton from "@/components/admin/delete-button";
import { deleteReview } from "@/app/admin/actions";
import type { Review, ReviewStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  approved: "bg-brand-600 text-white",
  rejected: "bg-accent-500/15 text-accent-700",
};
const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "На модерации",
  approved: "Опубликован",
  rejected: "Отклонён",
};

export default async function AdminReviews() {
  const pb = createServerPb();
  let reviews: Review[] = [];
  try {
    const list = await pb.collection("reviews").getFullList({
      sort: "-published_at",
      // Название сорта — чтобы модератор сразу видел, о чём отзыв: от этого
      // зависит рейтинг конкретной карточки в поисковой выдаче.
      expand: "product",
    });
    reviews = list.map(mapReview);
  } catch {
    reviews = [];
  }
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
          <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            на модерации: {pendingCount}
          </span>
        )}
      </h2>

      <CreateReviewForm />

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
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} />
                    {r.source === "ozon" && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
                        Ozon
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-brand-800">
                    {r.author_name || "Покупатель"}
                  </div>
                  <div className="text-xs text-brand-500">
                    {formatDate(r.created_at)}
                    {r.order_id ? " · по заказу" : ""}
                  </div>
                  {r.product_id && (
                    <div className="mt-1.5">
                      <span className="badge bg-brand-100 text-brand-700">
                        🌱 о сорте: {r.product_name || r.product_id}
                      </span>
                    </div>
                  )}
                </div>
                <span className={`badge ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-brand-700">
                {r.text}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <ReviewModeration id={r.id} status={r.status} />
                <DeleteButton
                  action={deleteReview.bind(null, r.id)}
                  confirmText={`Точно удалить отзыв «${r.author_name || "Покупатель"}» из базы? Действие необратимо.`}
                >
                  Удалить
                </DeleteButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
