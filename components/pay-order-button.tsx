"use client";

import { useEffect, useRef, useState } from "react";
import SmartCaptcha, {
  captchaEnabled,
  type SmartCaptchaHandle,
} from "@/components/smart-captcha";
import { submitPaymentForm, type PaymentResponse } from "@/lib/payment-form";
import Spinner from "@/components/spinner";

// Кнопка «Оплатить» для заказа, который ждёт оплаты.
//
// Заказ уже в базе (создаётся при оформлении со статусом «ожидает оплаты»),
// поэтому оплатить его можно в любой момент: сервер выставляет новый счёт и
// возвращает данные POST-формы для Robokassa.
//
// Капча создаётся только после клика: в истории заказов кнопок может быть много,
// поэтому не создаём отдельный невидимый виджет заранее для каждого заказа.
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<SmartCaptchaHandle>(null);

  async function pay(captchaToken: string) {
    try {
      const res = await fetch("/api/payment/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, invoice, captchaToken }),
      });
      const data = (await res.json().catch(() => ({}))) as PaymentResponse;
      if (!res.ok || !data.payment?.url || !data.payment?.fields) {
        setError(data.error ?? "Не удалось открыть оплату");
        setLoading(false);
        captchaRef.current?.reset();
        return;
      }
      submitPaymentForm(data.payment.url, data.payment.fields);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
      captchaRef.current?.reset();
    }
  }

  function startPayment() {
    setError(null);
    setLoading(true);
    if (!captchaEnabled) {
      void pay("");
    } else if (open) {
      captchaRef.current?.execute();
    } else {
      setOpen(true);
    }
  }

  useEffect(() => {
    if (open) captchaRef.current?.execute();
  }, [open]);

  function captchaError(message: string) {
    setError(message);
    setLoading(false);
  }

  return (
    <div>
      {open && (
        <SmartCaptcha
          ref={captchaRef}
          onToken={(token) => void pay(token)}
          onError={captchaError}
        />
      )}
      <button
        type="button"
        onClick={startPayment}
        disabled={loading}
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
      {error && (
        <p role="alert" className="alert-error mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
