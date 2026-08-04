import Link from "next/link";
import { formatPrice } from "@/lib/format";
import ClearCartOnPaid from "@/components/clear-cart-on-paid";
import MetrikaPurchase from "@/components/metrika-purchase";
import { servicePageMetadata } from "@/lib/seo";

// canonical свой у каждого заказа: страница подтверждения существует по своему
// адресу, и объявлять её копией главной (как было по умолчанию из layout)
// нельзя. Индексировать при этом нечего — см. servicePageMetadata.
export function generateMetadata({ params }: { params: { id: string } }) {
  // При неудачной оплате заказа не существует (он создаётся только после
  // оплаты), поэтому сюда приходит /order/failed — номера в заголовке нет.
  const numbered = /^\d+$/.test(params.id);
  return servicePageMetadata(
    `/order/${params.id}`,
    numbered ? `Заказ №${params.id}` : "Оплата не прошла"
  );
}

export default function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    total?: string;
    name?: string;
    paid?: string;
    failed?: string;
    // Номер счёта в Robokassa и признак «оплата прошла, номер заказа ещё
    // формируется» (крайне редкий случай, см. app/payment/success).
    inv?: string;
    pending?: string;
  };
}) {
  const total = searchParams.total ? Number(searchParams.total) : null;
  const paid = searchParams.paid === "1";
  const failed = searchParams.failed === "1";
  const pending = searchParams.pending === "1";
  const numbered = /^\d+$/.test(params.id);
  const invoice = searchParams.inv && /^\d+$/.test(searchParams.inv) ? searchParams.inv : null;

  // Оформление внешнего вида по результату оплаты.
  const icon = paid ? "✅" : failed ? "⚠️" : "✅";
  const title = paid
    ? pending || !numbered
      ? "Оплата получена!"
      : `Заказ №${params.id} оплачен!`
    : failed
    ? `Оплата не прошла`
    : `Заказ №${params.id} оформлен!`;

  return (
    <div className="container-page py-16">
      {/* Цель «покупка» (или «оплата не прошла») в Яндекс.Метрике.
          При онлайн-оплате состав заказа складывался под номером счёта —
          сверять можно и по нему (matchId). */}
      <MetrikaPurchase orderId={params.id} matchId={invoice} failed={failed} />
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
          {icon}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-brand-800">{title}</h1>

        {paid && (
          <>
            {/* Оплата прошла — корзину можно очистить. */}
            <ClearCartOnPaid />
            <p className="mt-3 text-brand-600">
              {searchParams.name ? `${searchParams.name}, спасибо! ` : ""}
              {pending || !numbered
                ? "Оплата получена. Номер заказа придёт письмом в ближайшие минуты."
                : "Оплата получена, заказ принят в работу."}{" "}
              Чек придёт на указанную почту, о смене статуса заказа сообщим
              письмом.
            </p>
          </>
        )}
        {failed && (
          <p className="mt-3 text-brand-600">
            Деньги не списаны, заказ не оформлен. Товары остались в корзине —
            можно попробовать оплатить ещё раз или выбрать другую карту.
          </p>
        )}
        {invoice && (paid || failed) && (
          <p className="mt-3 text-xs text-brand-400">Счёт №{invoice}</p>
        )}
        {!paid && !failed && (
          <p className="mt-3 text-brand-600">
            {searchParams.name ? `${searchParams.name}, спасибо за заказ! ` : ""}
            Мы свяжемся с вами для подтверждения.
          </p>
        )}

        {!failed && total !== null && !Number.isNaN(total) && (
          <p className="mt-4 text-lg font-extrabold text-brand-700">
            Сумма заказа: {formatPrice(total)}
          </p>
        )}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {failed ? (
            <>
              <Link href="/cart" className="btn-primary">
                Вернуться в корзину
              </Link>
              <Link href="/" className="btn-outline">
                На главную
              </Link>
            </>
          ) : (
            <>
              <Link href="/catalog" className="btn-primary">
                Продолжить покупки
              </Link>
              <Link href="/" className="btn-outline">
                На главную
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
