import { productDiscount } from "@/lib/product-pricing";

const money = (value: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", maximumFractionDigits: 2,
}).format(value);

export default function ProductPrice({ price, discountPercent = 0, large = false }: {
  price: number; discountPercent?: number; large?: boolean;
}) {
  const discount = productDiscount(price, discountPercent);
  return (
    <div className="min-w-0">
      {discount && (
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="relative inline-block whitespace-nowrap px-0.5 text-sm font-medium text-brand-400">
            <span className="sr-only">Прежняя цена: </span>
            <del className="no-underline">{money(discount.oldPrice)}</del>
            <svg aria-hidden="true" viewBox="0 0 100 20" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2 text-accent-500/80">
              <path d="M2 16 Q45 5 98 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="inline-flex -rotate-3 whitespace-nowrap rounded-lg bg-accent-500/10 px-2 py-0.5 text-xs font-extrabold text-accent-600 ring-1 ring-inset ring-accent-500/15">
            −{discount.percent}%
          </span>
        </div>
      )}
      <span className={`block whitespace-nowrap font-extrabold tracking-tight text-brand-700 ${large ? "text-4xl" : "text-lg"}`}>
        <span className="sr-only">Цена: </span>{money(price)}
      </span>
    </div>
  );
}
