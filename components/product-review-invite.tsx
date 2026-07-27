"use client";

import { useState } from "react";
import Link from "next/link";
import LeaveReview from "@/components/leave-review";
import type { Review } from "@/lib/types";

type Eligibility = {
  loggedIn: boolean;
  canReview: boolean;
  defaultName: string;
  own: Review | null;
};

// Кнопка «Оставить отзыв о сорте» и, по клику, сама форма.
//
// Право проверяется на сервере (/api/product-review/eligibility), но ЗАПРОС
// уходит только когда покупатель нажал кнопку. Причины две: карточка товара
// остаётся статической (ISR) — проверка cookie на сервере при рендере выбила
// бы её в динамику; и мы не тратим по лишнему запросу к базе на каждый
// просмотр карточки, а их большинство.
//
// Отдельная страховка: даже если сюда как-то попадёт «можно» — server action
// submitProductReview проверяет заказ и повторный отзыв заново.
export default function ProductReviewInvite({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [state, setState] = useState<Eligibility | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function check() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/product-review/eligibility?product=${encodeURIComponent(productId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(String(res.status));
      setState((await res.json()) as Eligibility);
    } catch {
      // Сеть или база недоступны — показываем понятное сообщение вместо
      // сломанного блока; остальная карточка товара продолжает работать.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="btn-outline"
        >
          {busy ? "Проверяем…" : "Оставить отзыв о сорте"}
        </button>
        {failed && (
          <p role="alert" className="mt-2 text-sm text-brand-500">
            Не удалось проверить, можно ли оставить отзыв. Попробуйте ещё раз.
          </p>
        )}
        <p className="mt-2 text-xs text-brand-500">
          Отзыв можно оставить после получения заказа с этим сортом.
        </p>
      </div>
    );
  }

  if (!state.loggedIn) {
    return (
      <div className="card mt-6 max-w-xl p-5 text-sm text-brand-600">
        Чтобы оставить отзыв о сорте,{" "}
        <Link href="/login" className="font-semibold underline">
          войдите в аккаунт
        </Link>
        . Отзыв доступен покупателям, получившим заказ с этим сортом.
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-xl">
      <LeaveReview
        productId={productId}
        canReview={state.canReview}
        defaultName={state.defaultName}
        existing={state.own}
        placeholder={`Как показал себя сорт ${productName}: всхожесть, урожайность, вкус…`}
        cannotReviewText="Отзыв о сорте можно оставить после получения заказа с ним."
      />
    </div>
  );
}
