import Stars from "@/components/stars";
import ReviewCard from "@/components/review-card";
import ProductReviewInvite from "@/components/product-review-invite";
import { ratingSummary } from "@/lib/reviews";
import type { Review } from "@/lib/types";

// «1 отзыв / 2 отзыва / 5 отзывов».
function reviewsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

// Видимый блок отзывов о сорте. Серверный компонент без обращения к cookie:
// и список, и средняя оценка попадают в SSR-HTML, а страница остаётся на ISR
// (revalidate 60). Из этих же данных считается aggregateRating микроразметки —
// см. app/product/[slug]/page.tsx.
//
// Право оставить отзыв зависит от конкретного покупателя, поэтому проверка
// вынесена в клиентский ProductReviewInvite: иначе чтение cookie выбило бы
// каждую карточку товара из ISR в рендер на каждый запрос.
export default function ProductReviews({
  productId,
  productName,
  reviews,
}: {
  productId: string;
  productName: string;
  reviews: Review[];
}) {
  const summary = ratingSummary(reviews);

  return (
    <section className="mt-14">
      <h2 className="mb-4 text-xl font-bold text-brand-800">
        Отзывы о сорте {productName}
      </h2>

      {summary ? (
        <div className="mb-5 flex items-center gap-3">
          <span className="text-3xl font-black text-brand-800">
            {summary.value.toFixed(1).replace(".", ",")}
          </span>
          <span>
            <Stars value={Math.round(summary.value)} className="text-xl" />
            <span className="block text-sm text-brand-500">
              {summary.count} {reviewsWord(summary.count)}
            </span>
          </span>
        </div>
      ) : (
        <p className="mb-5 text-sm text-brand-500">
          У этого сорта пока нет отзывов. Первый — за вами.
        </p>
      )}

      {reviews.length > 0 && (
        <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <ReviewCard key={r.id} review={r} index={i} hideProductName />
          ))}
        </div>
      )}

      <ProductReviewInvite productId={productId} productName={productName} />
    </section>
  );
}
