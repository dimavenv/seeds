import type { Metadata } from "next";

export const metadata: Metadata = { title: "Доставка — Semena Collection" };

export default function DeliveryPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Доставка</h1>
        <div className="mt-5 space-y-4 leading-relaxed text-brand-700">
          <p>Мы доставляем заказы по всей России удобными для вас способами:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Почта России</strong> — отправка в любой населённый пункт,
              срок 5–14 дней в зависимости от региона.
            </li>
            <li>
              <strong>СДЭК / транспортные компании</strong> — доставка до пункта
              выдачи или до двери, срок 2–7 дней.
            </li>
          </ul>
          <p>
            Стоимость доставки рассчитывается индивидуально после оформления
            заказа — менеджер свяжется с вами и сообщит точную сумму.
          </p>
          <p>
            Заказы отправляются в течение 1–2 рабочих дней после подтверждения.
          </p>
        </div>
        <p className="mt-6 text-sm text-brand-500">
          Текст можно отредактировать в файле{" "}
          <code className="rounded bg-brand-100 px-1">app/delivery/page.tsx</code>.
        </p>
      </div>
    </div>
  );
}
