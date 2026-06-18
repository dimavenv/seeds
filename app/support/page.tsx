import type { Metadata } from "next";

export const metadata: Metadata = { title: "Поддержка — Tomat Semena" };

export default function SupportPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Поддержка</h1>
        <div className="mt-5 space-y-4 leading-relaxed text-brand-700">
          <p>
            По всем вопросам — о заказе, доставке, оплате или ассортименте —
            пишите нам на почту:
          </p>
          <p>
            <a
              href="mailto:info@tomatsemena.ru"
              className="text-lg font-semibold text-brand-700 underline hover:text-brand-800"
            >
              info@tomatsemena.ru
            </a>
          </p>
          <p>
            Мы отвечаем в течение рабочего дня и поможем выбрать подходящие сорта
            для вашего участка.
          </p>
        </div>
        <p className="mt-6 text-sm text-brand-500">
          Текст можно отредактировать в файле{" "}
          <code className="rounded bg-brand-100 px-1">app/support/page.tsx</code>.
        </p>
      </div>
    </div>
  );
}
