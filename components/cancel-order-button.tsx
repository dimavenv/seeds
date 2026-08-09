"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelUnpaidOrder } from "@/app/account/actions";

// Отмена своего неоплаченного заказа.
//
// Подтверждение спрашиваем на месте, а не системным confirm(): диалог браузера
// выглядит чужеродно, а здесь важно спокойно объяснить, что произойдёт.
export default function CancelOrderButton({
  orderId,
  className = "text-sm font-semibold text-brand-500 transition hover:text-accent-600",
}: {
  orderId: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function cancel() {
    setError(null);
    start(async () => {
      const res = await cancelUnpaidOrder(orderId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAsking(false);
      router.refresh();
    });
  }

  if (!asking) {
    return (
      <div>
        <button type="button" onClick={() => setAsking(true)} className={className}>
          Отменить
        </button>
        {error && (
          <p role="alert" className="mt-1 text-xs text-accent-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent-500/30 bg-accent-500/5 p-3">
      <p className="text-sm text-brand-700">
        Отменить заказ? Товар вернётся в продажу, промокод — к вам. Отменённый
        заказ оплатить уже нельзя, но он останется в истории.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-accent-600">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-full bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-60"
        >
          {pending ? "Отменяем…" : "Да, отменить"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          disabled={pending}
          className="text-sm text-brand-500 hover:text-brand-700"
        >
          Оставить заказ
        </button>
      </div>
    </div>
  );
}
