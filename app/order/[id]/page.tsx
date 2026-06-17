import Link from "next/link";
import { formatPrice } from "@/lib/format";

export default function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { total?: string; name?: string };
}) {
  const total = searchParams.total ? Number(searchParams.total) : null;

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
          ✅
        </div>
        <h1 className="mt-5 text-2xl font-bold text-brand-800">
          Заказ №{params.id} оформлен!
        </h1>
        <p className="mt-3 text-brand-600">
          {searchParams.name ? `${searchParams.name}, спасибо за заказ! ` : ""}
          Мы свяжемся с вами в ближайшее время для подтверждения и расчёта
          доставки.
        </p>
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
