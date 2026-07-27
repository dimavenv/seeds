import type { Review } from "@/lib/types";

// Агрегированный рейтинг сорта: то, что рисуется звёздами на странице и
// уходит в aggregateRating микроразметки. Одно и то же число в обоих местах —
// иначе это разметка, не подтверждённая видимым содержимым, а за неё и Google,
// и Яндекс снимают расширенный сниппет вручную.

export type RatingSummary = {
  /** Средняя оценка, округлённая до десятых (1–5). */
  value: number;
  /** Сколько отзывов учтено. */
  count: number;
};

// Только опубликованные отзывы. Отзыв на модерации (pending) или отклонённый
// не виден покупателю — значит, он не должен влиять ни на среднюю оценку, ни
// на счётчик.
export function approvedOnly(reviews: Review[]): Review[] {
  return reviews.filter((r) => r.status === "approved");
}

// null (а не нули) — когда учитывать нечего: вызывающий код по этому признаку
// вообще не рисует блок рейтинга и не добавляет aggregateRating в JSON-LD.
export function ratingSummary(reviews: Review[]): RatingSummary | null {
  const approved = approvedOnly(reviews).filter(
    // Оценка вне 1–5 — испорченная запись; в среднюю её пускать нельзя,
    // schema.org тоже требует значение внутри worstRating…bestRating.
    (r) => Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5
  );
  if (approved.length === 0) return null;
  const sum = approved.reduce((acc, r) => acc + r.rating, 0);
  return {
    value: Math.round((sum / approved.length) * 10) / 10,
    count: approved.length,
  };
}
