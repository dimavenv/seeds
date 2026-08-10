"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelUnpaidOrder } from "@/app/account/actions";

// Отмена своего неоплаченного заказа.
//
// Подтверждение — в диалоге поверх страницы, а не системным confirm() и не
// плашкой, распирающей карточку заказа: отмена необратима, и на неё стоит
// посмотреть спокойно, отдельно от остального. Диалог закрывается по Esc и по
// клику мимо, фокус при открытии уходит на безопасную кнопку «Оставить заказ».
export default function CancelOrderButton({
  orderId,
  number,
  className = "text-sm font-semibold text-brand-500 transition hover:text-accent-600",
}: {
  orderId: string;
  // Номер заказа — чтобы в диалоге было видно, что именно отменяем.
  number?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const keepRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Страница под диалогом не должна прокручиваться «сквозь» него.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, pending]);

  function cancel() {
    setError(null);
    start(async () => {
      const res = await cancelUnpaidOrder(orderId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Отменить
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-900/40 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="card w-full max-w-sm p-6 text-center shadow-xl">
            <div
              aria-hidden="true"
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/10 text-accent-600"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                <path
                  fillRule="evenodd"
                  d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2
              id="cancel-order-title"
              className="mt-4 text-lg font-bold text-brand-800"
            >
              {number ? `Отменить заказ #${number}?` : "Отменить заказ?"}
            </h2>
            <p className="mt-2 text-sm text-brand-600">
              Товар вернётся в продажу, промокод — к вам. Оплатить отменённый
              заказ уже нельзя, но он останется в истории.
            </p>

            {error && (
              <p role="alert" className="alert-error mt-4 text-left">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="btn w-full bg-accent-500 text-white hover:bg-accent-600"
              >
                {pending ? "Отменяем…" : "Да, отменить заказ"}
              </button>
              <button
                ref={keepRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={pending}
                className="btn-outline w-full"
              >
                Оставить заказ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
