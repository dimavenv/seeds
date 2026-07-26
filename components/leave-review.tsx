"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "@/app/account/actions";
import Stars from "@/components/stars";
import type { Review } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  pending: "Ваш отзыв отправлен и ожидает модерации.",
  approved: "Ваш отзыв опубликован. Спасибо!",
  rejected: "Ваш отзыв отклонён модератором.",
};

export default function LeaveReview({
  orderId,
  canReview,
  defaultName,
  existing,
}: {
  orderId: string;
  canReview: boolean;
  defaultName: string;
  existing: Review | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState(defaultName);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Уже оставлен.
  if (existing) {
    return (
      <div className="card p-5">
        <h3 className="font-bold text-brand-800">Ваш отзыв</h3>
        <div className="mt-2">
          <Stars value={existing.rating} />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-brand-700">
          {existing.text}
        </p>
        <p className="mt-2 text-xs text-brand-500">
          {STATUS_TEXT[existing.status] ?? ""}
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-5 text-center">
        <div className="text-3xl">🌟</div>
        <p className="mt-2 font-semibold text-brand-800">
          Спасибо! Отзыв отправлен на модерацию.
        </p>
        <p className="mt-1 text-sm text-brand-600">
          После проверки он появится в разделе «Отзывы».
        </p>
      </div>
    );
  }

  if (!canReview) {
    return (
      <div className="card p-5 text-sm text-brand-500">
        Оставить отзыв можно после получения заказа.
      </div>
    );
  }

  async function send() {
    setError(null);
    if (!rating) {
      setError("Поставьте оценку");
      return;
    }
    setBusy(true);
    const res = await submitReview({ orderId, rating, text, authorName: name });
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div className="card p-5">
      <h3 className="font-bold text-brand-800">Оставить отзыв</h3>

      <div
        className="mt-3 flex gap-1 text-2xl"
        role="radiogroup"
        aria-label="Оценка"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`Оценка ${n}`}
            className={`rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              n <= (hover || rating) ? "text-accent-500" : "text-brand-200"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ваше имя"
        className="input mt-3"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Расскажите о сортах, всхожести, упаковке и доставке…"
        className="input mt-3 min-h-28"
      />

      {error && (
        <p role="alert" className="mt-2 alert-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="btn-accent mt-3 w-full sm:w-auto"
      >
        {busy ? "Отправляем…" : "Отправить отзыв"}
      </button>
      <p className="mt-2 text-xs text-brand-500">
        Отзыв публикуется после проверки модератором.
      </p>
    </div>
  );
}
