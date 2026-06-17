import type { Metadata } from "next";

export const metadata: Metadata = { title: "Оплата — Semena Collection" };

export default function PaymentPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Оплата</h1>
        <div className="mt-5 space-y-4 leading-relaxed text-brand-700">
          <p>Оплатить заказ можно удобным для вас способом:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Наложенным платежом</strong> при получении на почте или в
              пункте выдачи.
            </li>
            <li>
              <strong>Переводом на карту</strong> по реквизитам, которые
              сообщит менеджер.
            </li>
            <li>
              <strong>По счёту</strong> — для оптовых и юридических заказов.
            </li>
          </ul>
          <p>
            После оформления заказа менеджер свяжется с вами для подтверждения и
            выбора способа оплаты. Предоплата за товар не требуется.
          </p>
        </div>
        <p className="mt-6 text-sm text-brand-500">
          Текст можно отредактировать в файле{" "}
          <code className="rounded bg-brand-100 px-1">app/payment/page.tsx</code>.
        </p>
      </div>
    </div>
  );
}
