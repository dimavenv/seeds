"use client";

import { useState } from "react";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";
import { submitPaymentForm, type PaymentResponse } from "@/lib/payment-form";
import Spinner from "@/components/spinner";

// Кнопка «Оплатить» для заказа, который ждёт оплаты.
//
// Заказ уже в базе (создаётся при оформлении со статусом «ожидает оплаты»),
// поэтому оплатить его можно в любой момент: сервер выставляет новый счёт и
// возвращает данные POST-формы для Robokassa.
//
// Капча появляется по клику, а не висит на странице: в истории заказов их может
// быть несколько, и рисовать под каждым по виджету — некрасиво и лишний вес.
export default function PayOrderButton({
  orderId,
  invoice,
  className = "btn-accent",
  label = "Оплатить",
}: {
  // Заказ из личного кабинета (проверяется владелец) …
  orderId?: string;
  // … либо номер счёта — для гостя, вернувшегося с неудачной оплаты.
  invoice?: number;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function pay() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payment/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, invoice, captchaToken: token }),
      });
      const data = (await res.json().catch(() => ({}))) as PaymentResponse;
      if (!res.ok || !data.payment?.url || !data.payment?.fields) {
        setError(data.error ?? "Не удалось открыть оплату");
        setLoading(false);
        // Токен капчи одноразовый — сбрасываем виджет для повторной попытки.
        setToken("");
        setCaptchaReset((n) => n + 1);
        return;
      }
      submitPaymentForm(data.payment.url, data.payment.fields);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  // Капча выключена на сайте — платим сразу по клику.
  if (!captchaEnabled) {
    return (
      <div>
        <button
          type="button"
          onClick={pay}
          disabled={loading}
          className={className}
        >
          {loading ? "Открываем оплату…" : label}
        </button>
        {error && (
          <p role="alert" className="alert-error mt-2 text-sm">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-surface p-4">
      <p className="mb-3 text-sm font-semibold text-brand-700">
        Подтвердите, что вы не робот
      </p>
      <SmartCaptcha onToken={setToken} resetSignal={captchaReset} />
      {error && (
        <p role="alert" className="alert-error mt-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={pay}
          disabled={loading || !token}
          className={className}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner className="h-4 w-4" /> Открываем оплату…
            </span>
          ) : (
            label
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-sm text-brand-500 hover:text-brand-700"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
