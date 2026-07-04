import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

const STATUS_CLASSES: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  shipped: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  done: "bg-brand-100 text-brand-700",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${STATUS_CLASSES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
