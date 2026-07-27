"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import Stars from "@/components/stars";
import type { Review } from "@/lib/types";

const AVATAR_COLORS = [
  "bg-brand-600 text-white",
  "bg-accent-500 text-white",
  "bg-amber-500 text-white",
  "bg-teal-600 text-white",
  "bg-violet-600 text-white",
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Длинные отзывы сворачиваем, чтобы карточки в сетке были ровными и читаемыми.
const CLAMP_LENGTH = 280;

export default function ReviewCard({
  review,
  index,
  hideProductName = false,
}: {
  review: Review;
  index: number;
  /** На странице самого сорта подпись «о сорте …» избыточна. */
  hideProductName?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = review.author_name || "Покупатель";
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const isOzon = review.source === "ozon";
  const isLong = review.text.length > CLAMP_LENGTH;
  const shown =
    isLong && !expanded
      ? review.text.slice(0, CLAMP_LENGTH).trimEnd() + "…"
      : review.text;

  return (
    <div
      style={{ animationDelay: `${(index % 6) * 70}ms` }}
      className="card flex flex-col gap-3 p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-fade-up"
    >
      {/* Шапка: аватар + имя + дата */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor}`}
        >
          {initials(name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-brand-800">{name}</span>
            {isOzon && (
              // tabIndex + focus-within: подсказка доступна и с клавиатуры,
              // а не только по ховеру мыши.
              <span
                className="group relative cursor-default focus:outline-none"
                tabIndex={0}
                aria-label="Отзыв перенесён с Ozon"
              >
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
                  Ozon
                </span>
                {/* brand-900/50 инвертируются вместе с темой: тёмный фон +
                    светлый текст в светлой теме, и наоборот в тёмной. */}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-xl bg-brand-900 px-3 py-2 text-center text-xs text-brand-50 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  Данный отзыв был перенесён с&nbsp;Ozon
                  <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-brand-900" />
                </span>
              </span>
            )}
          </div>
          <div className="text-xs text-brand-400">
            {formatDate(review.created_at)}
          </div>
        </div>
      </div>

      {/* Звёзды */}
      <Stars value={review.rating} />

      {/* Для отзыва о конкретном сорте — о каком именно. На странице самого
          сорта подпись не нужна: там это и так очевидно из заголовка. */}
      {review.product_name && !hideProductName && (
        <div className="-mt-1 text-xs text-brand-500">
          о сорте{" "}
          <span className="font-semibold text-brand-600">
            {review.product_name}
          </span>
        </div>
      )}

      {/* Текст с кавычкой */}
      <div className="relative flex-1 pl-4">
        <span className="absolute left-0 top-0 text-2xl font-black leading-none text-accent-500/30">
          &ldquo;
        </span>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-700">
          {shown}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-sm font-semibold text-accent-500 hover:text-accent-600"
          >
            {expanded ? "Свернуть" : "Читать полностью"}
          </button>
        )}
      </div>
    </div>
  );
}
