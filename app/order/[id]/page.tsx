import Link from "next/link";
import { formatPrice } from "@/lib/format";

export default function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { total?: string; name?: string; paid?: string; failed?: string; payerr?: string };
}) {
  const total = searchParams.total ? Number(searchParams.total) : null;
  const paid = searchParams.paid === "1";
  const failed = searchParams.failed === "1";
  const payerr = searchParams.payerr === "1";

  // Оформление внешнего вида по результату оплаты.
  const icon = paid ? "✅" : failed ? "⚠️" : "✅";
  const title = paid
    ? `Заказ №${params.id} оплачен!`
    : failed
    ? `Оплата заказа №${params.id} не прошла`
    : `Заказ №${params.id} оформлен!`;

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
          {icon}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-brand-800">{title}</h1>

        {paid && (
          <p className="mt-3 text-brand-600">
            {searchParams.name ? `${searchParams.name}, спасибо! ` : ""}
            Оплата получена, заказ принят в работу. Чек придёт на указанную почту.
          </p>
        )}
        {failed && (
          <p className="mt-3 text-brand-600">
            Платёж не завершён, но заказ мы сохранили — он не потеряется. Мы
            свяжемся с вами для подтверждения, оплатить можно будет при
            получении.
          </p>
        )}
        {!paid && !failed && (
          <p className="mt-3 text-brand-600">
            {searchParams.name ? `${searchParams.name}, спасибо за заказ! ` : ""}
            Мы свяжемся с вами для подтверждения. Доставка — 300 ₽ (Ozon или Почта
            России).
            {payerr && (
              <span className="mt-2 block text-sm text-accent-600">
                Онлайн-оплата временно недоступна — оплатите при получении.
              </span>
            )}
          </p>
        )}

        {total !== null && !Number.isNaN(total) && (
          <p className="mt-4 text-lg font-extrabold text-brand-700">
            Сумма заказа: {formatPrice(total)}
          </p>
        )}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/catalog" className="btn-primary">
            Продолжить покупки
          </Link>
          <Link href="/" className="btn-outline">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
