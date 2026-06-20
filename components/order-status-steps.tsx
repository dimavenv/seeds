import type { OrderStatus } from "@/lib/types";

// Прогресс выполнения заказа: Оформлен → В обработке → Отправлен → Доставлен.
const STEPS: { key: OrderStatus; label: string; icon: string }[] = [
  { key: "new", label: "Оформлен", icon: "📝" },
  { key: "processing", label: "В обработке", icon: "📦" },
  { key: "shipped", label: "Отправлен", icon: "🚚" },
  { key: "done", label: "Доставлен", icon: "✅" },
];

export default function OrderStatusSteps({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl bg-accent-500/10 px-4 py-3 text-center text-sm font-semibold text-accent-700">
        Заказ отменён
      </div>
    );
  }

  const current = Math.max(
    0,
    STEPS.findIndex((s) => s.key === status)
  );

  return (
    <ol className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const reached = i <= current;
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center text-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg transition ${
                  reached
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-200 bg-white text-brand-300"
                } ${active ? "ring-4 ring-brand-100" : ""}`}
              >
                {done ? "✓" : step.icon}
              </div>
              <span
                className={`mt-1.5 w-20 text-xs font-medium ${
                  reached ? "text-brand-700" : "text-brand-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 ${
                  i < current ? "bg-brand-600" : "bg-brand-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
