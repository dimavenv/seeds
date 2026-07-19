import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

const STYLES: Record<OrderStatus, string> = {
  new: "bg-accent-500/15 text-accent-600",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-sky-100 text-sky-700",
  done: "bg-brand-600 text-white",
  cancelled: "bg-brand-100 text-brand-500",
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge whitespace-nowrap ${STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
