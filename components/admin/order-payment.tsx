"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundOrder } from "@/app/admin/actions";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/types";

const BADGE: Record<PaymentStatus, string> = {
  unpaid: "bg-brand-100 text-brand-600",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-brand-600 text-white",
  failed: "bg-accent-500/15 text-accent-700",
  refunded: "bg-brand-200 text-brand-700",
};

export default function OrderPayment({
  id,
  status,
}: {
  id: string;
  status: PaymentStatus;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function doRefund() {
    if (!confirm("Вернуть оплату по этому заказу на карту покупателя?")) return;
    setError(null);
    start(async () => {
      const res = await refundOrder(id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`badge ${BADGE[status]}`}>
        {PAYMENT_STATUS_LABELS[status]}
      </span>
      {status === "paid" && (
        <button
          type="button"
          onClick={doRefund}
          disabled={pending}
          className="text-xs font-semibold text-accent-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Возврат…" : "Вернуть оплату"}
        </button>
      )}
      {error && <span className="text-xs text-accent-600">{error}</span>}
    </div>
  );
}
