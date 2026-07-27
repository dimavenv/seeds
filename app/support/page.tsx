import type { Metadata } from "next";
import SupportForm from "@/components/support-form";

export const metadata: Metadata = {
  title: "Поддержка — связаться с магазином",
  description:
    "Вопрос о заказе, доставке или сорте? Напишите нам — отвечаем на все " +
    "обращения по электронной почте.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Поддержка</h1>
        <p className="mt-4 leading-relaxed text-brand-700">
          Задайте вопрос о заказе, доставке, оплате или ассортименте — заполните
          форму, и мы ответим на указанную почту.
        </p>

        <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          ⚠️ <strong>Все запросы обрабатываются вручную и могут требовать
          времени.</strong> Ответ придёт на указанный email.
        </div>

        <div className="mt-6">
          <SupportForm />
        </div>

        <p className="mt-6 text-sm text-brand-500">
          Также можно написать напрямую на{" "}
          <a
            href="mailto:info@tomatsemena.ru"
            className="font-semibold text-brand-700 underline hover:text-brand-800"
          >
            info@tomatsemena.ru
          </a>
          .
        </p>
      </div>
    </div>
  );
}
