"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/app/admin/actions";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

export default function OrderStatusSelect({
  id,
  status,
}: {
  id: number;
  status: OrderStatus;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as OrderStatus;
        startTransition(async () => {
          await updateOrderStatus(id, next);
          router.refresh();
        });
      }}
      className="input !w-auto !py-1.5 text-sm"
    >
      {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
        <option key={s} value={s}>
          {ORDER_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
