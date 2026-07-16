"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundOrder } from "@/app/admin/actions";
import { formatPrice } from "@/lib/format";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/types";

const BADGE: Record<PaymentStatus, string> = {
  unpaid: "bg-brand-100 text-brand-600",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-brand-600 text-white",
  failed: "bg-accent-500/15 text-accent-700",
  refunded: "bg-brand-200 text-brand-700",
};

export type RefundableItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  refundedQty: number;
};

export default function OrderPayment({
  id,
  status,
  total,
  refundedAmount,
  items,
}: {
  id: string;
  status: PaymentStatus;
  total: number;
  refundedAmount: number;
  items: RefundableItem[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // full — весь остаток (включая доставку); items — выбранные позиции.
  const [mode, setMode] = useState<"full" | "items">("full");
  // Сколько штук каждой позиции вернуть (0 — не возвращать).
  const [picked, setPicked] = useState<Record<string, number>>({});
  const router = useRouter();

  const remaining = Math.max(0, Math.round((total - refundedAmount) * 100) / 100);
  const partial = status === "paid" && refundedAmount > 0;

  const pickedSum = useMemo(
    () =>
      items.reduce((s, it) => s + it.price * Math.min(picked[it.id] ?? 0, it.qty - it.refundedQty), 0),
    [items, picked]
  );
  const refundSum = mode === "full" ? remaining : Math.min(pickedSum, remaining);

  function openModal() {
    setError(null);
    setDone(null);
    setMode("full");
    setPicked({});
    setOpen(true);
  }

  function setQty(itemId: string, qty: number, max: number) {
    setPicked((p) => ({ ...p, [itemId]: Math.max(0, Math.min(qty, max)) }));
  }

  function doRefund() {
    setError(null);
    start(async () => {
      const res = await refundOrder(
        id,
        mode === "full"
          ? { mode: "full" }
          : {
              mode: "items",
              items: Object.entries(picked)
                .filter(([, q]) => q > 0)
                .map(([itemId, q]) => ({ id: itemId, qty: q })),
            }
      ).catch(() => ({ error: "Не удалось выполнить возврат — попробуйте ещё раз" } as const));
      if ("error" in res && res.error) {
        setError(res.error);
      } else if ("ok" in res && res.ok) {
        setDone(
          res.full
            ? `Возврат ${formatPrice(res.refunded ?? refundSum)} оформлен — заказ возвращён полностью`
            : `Частичный возврат ${formatPrice(res.refunded ?? refundSum)} оформлен`
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`badge ${partial ? "bg-amber-100 text-amber-700" : BADGE[status]}`}>
        {partial
          ? `Оплачен · возврат ${formatPrice(refundedAmount)}`
          : PAYMENT_STATUS_LABELS[status]}
      </span>
      {status === "paid" && remaining > 0 && (
        <button
          type="button"
          onClick={openModal}
          className="text-xs font-semibold text-accent-600 hover:underline"
        >
          Вернуть оплату
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none p-0 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Возврат средств"
          >
            {/* Шапка */}
            <div className="flex items-center justify-between border-b border-brand-100 px-5 py-4">
              <div>
                <div className="text-base font-bold text-brand-800">Возврат средств</div>
                <div className="text-xs text-brand-500">
                  Оплачено {formatPrice(total)}
                  {refundedAmount > 0 && ` · уже возвращено ${formatPrice(refundedAmount)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="rounded-full p-1.5 text-brand-400 transition hover:bg-brand-100 hover:text-brand-700"
                aria-label="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="px-5 py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="font-semibold text-brand-800">{done}</p>
                <p className="mt-1 text-sm text-brand-500">
                  Покупателю отправлено письмо. Деньги вернутся на карту в течение 1–10 дней.
                </p>
                <button type="button" onClick={() => setOpen(false)} className="btn-primary mt-5">
                  Готово
                </button>
              </div>
            ) : (
              <>
                {/* Выбор: весь заказ или отдельные товары */}
                <div className="grid grid-cols-2 gap-2 px-5 pt-4">
                  <button
                    type="button"
                    onClick={() => setMode("full")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      mode === "full"
                        ? "border-brand-500 bg-brand-500/10 text-brand-700"
                        : "border-brand-200 text-brand-500 hover:border-brand-300"
                    }`}
                  >
                    Весь заказ
                    <span className="block text-xs font-normal opacity-70">
                      {formatPrice(remaining)} с доставкой
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("items")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      mode === "items"
                        ? "border-brand-500 bg-brand-500/10 text-brand-700"
                        : "border-brand-200 text-brand-500 hover:border-brand-300"
                    }`}
                  >
                    Выбрать товары
                    <span className="block text-xs font-normal opacity-70">частичный возврат</span>
                  </button>
                </div>

                {/* Список позиций */}
                {mode === "items" && (
                  <div className="mt-3 space-y-2 px-5">
                    {items.map((it) => {
                      const left = it.qty - it.refundedQty;
                      const q = Math.min(picked[it.id] ?? 0, Math.max(0, left));
                      const checked = q > 0;
                      if (left <= 0) {
                        return (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5 opacity-60"
                          >
                            <span className="min-w-0 truncate text-sm text-brand-500 line-through">
                              {it.name}
                            </span>
                            <span className="badge shrink-0 bg-brand-200 text-brand-700">
                              возвращено
                            </span>
                          </div>
                        );
                      }
                      return (
                        <label
                          key={it.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                            checked
                              ? "border-brand-400 bg-brand-500/5"
                              : "border-brand-200 hover:border-brand-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setQty(it.id, e.target.checked ? left : 0, left)}
                            className="h-4 w-4 shrink-0 accent-brand-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-brand-800">
                              {it.name}
                            </span>
                            <span className="block text-xs text-brand-500">
                              {formatPrice(it.price)} × {left}
                              {it.refundedQty > 0 && ` (возвращено ${it.refundedQty} из ${it.qty})`}
                            </span>
                          </span>
                          {checked && left > 1 && (
                            <span
                              className="flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-surface px-1 py-0.5"
                              onClick={(e) => e.preventDefault()}
                            >
                              <button
                                type="button"
                                onClick={() => setQty(it.id, q - 1, left)}
                                className="h-6 w-6 rounded-full text-brand-600 transition hover:bg-brand-100"
                                aria-label="Меньше"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm font-bold text-brand-800">{q}</span>
                              <button
                                type="button"
                                onClick={() => setQty(it.id, q + 1, left)}
                                className="h-6 w-6 rounded-full text-brand-600 transition hover:bg-brand-100"
                                aria-label="Больше"
                              >
                                +
                              </button>
                            </span>
                          )}
                          {checked && (
                            <span className="shrink-0 text-sm font-bold text-brand-700">
                              {formatPrice(it.price * q)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                    <p className="pt-1 text-xs text-brand-400">
                      Доставка при частичном возврате не возвращается — для этого выберите «Весь заказ».
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mx-5 mt-3 rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-2.5 text-sm font-semibold text-accent-700">
                    {error}
                  </div>
                )}

                {/* Итог и кнопки */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-brand-100 px-5 py-4">
                  <div>
                    <div className="text-xs text-brand-500">К возврату</div>
                    <div className="text-lg font-extrabold text-brand-800">{formatPrice(refundSum)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      disabled={pending}
                      className="btn-outline"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={doRefund}
                      disabled={pending || refundSum <= 0}
                      className="btn-accent"
                    >
                      {pending ? "Возврат…" : `Вернуть ${formatPrice(refundSum)}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
