import type { Metadata } from "next";
import Link from "next/link";
import { createPublicPb } from "@/lib/pb/server";
import { isDbConfigured, mapReview } from "@/lib/pb/shared";
import Stars from "@/components/stars";
import ReviewCard from "@/components/review-card";
import JsonLd from "@/components/json-ld";
import { ORGANIZATION_ID } from "@/lib/seo";
import type { Review } from "@/lib/types";

export const metadata: Metadata = {
  title: "Отзывы покупателей о семенах",
  description:
    "Реальные отзывы покупателей о всхожести семян, сортах и доставке " +
    "магазина «Томат Семена». Оценки и комментарии после полученных заказов.",
  alternates: { canonical: "/reviews" },
};
export const dynamic = "force-dynamic";

// «на основе 1 отзыва / 5 отзывов / 21 отзыва» — прежний вариант давал
// «21 отзывов» и содержал две одинаковые ветви тернарника.
function reviewsWord(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "отзыва" : "отзывов";
}

// Рейтинг магазина в микроразметке. Вешаем его на тот же узел Organization,
// что объявлен в app/layout.tsx (совпадающий @id), — так поисковик понимает,
// что оценки относятся к продавцу.
//
// Именно к продавцу, а не к товару: отзывы в базе не связаны с конкретным
// сортом (у коллекции reviews нет отношения к products). Подставить общий
// рейтинг магазина в карточку каждого сорта — известный способ получить
// ручные санкции за недостоверную разметку, поэтому там его нет.
function reviewsJsonLd(reviews: Review[]) {
  const average =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID(),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(average.toFixed(1)),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.slice(0, 20).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author_name },
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      reviewBody: r.text,
      ...(r.created_at ? { datePublished: r.created_at.slice(0, 10) } : {}),
    })),
  };
}

export default async function ReviewsPage() {
  let reviews: Review[] = [];
  if (isDbConfigured()) {
    try {
      const pb = createPublicPb();
      const page = await pb.collection("reviews").getList(1, 100, {
        filter: 'status = "approved"',
        sort: "-published_at",
      });
      reviews = page.items.map(mapReview);
    } catch {
      reviews = [];
    }
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
      {reviews.length > 0 && <JsonLd data={reviewsJsonLd(reviews)} />}
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
              на основе {reviews.length} {reviewsWord(reviews.length)}
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
          <div className="mt-10 grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <ReviewCard key={r.id} review={r} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
