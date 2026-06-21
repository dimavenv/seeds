import { formatDateRu } from "@/lib/format";

// Плашка «Отпуск» под навигацией. Показывается, только если задана будущая дата.
export default function VacationBanner({ until }: { until: string | null }) {
  if (!until) return null;
  const [y, m, d] = until.split("-").map(Number);
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (end < today) return null; // отпуск уже закончился

  return (
    <div className="border-b border-accent-500/20 bg-accent-500/10">
      <div className="container-page py-2.5 text-center text-sm font-medium text-accent-600">
        🌴 Сейчас у нас отпуск. Заказы оформляются как обычно, но отправим мы их
        после <span className="font-bold">{formatDateRu(until)}</span>.
      </div>
    </div>
  );
}
