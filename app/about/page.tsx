import type { Metadata } from "next";

export const metadata: Metadata = { title: "О нас — Tomat Semena" };

export default function AboutPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">О нас</h1>
        <div className="mt-5 space-y-4 leading-relaxed text-brand-700">
          <p>
            <strong>Tomat Semena</strong> — интернет-магазин качественных
            семян овощей и бахчевых культур. Мы предлагаем проверенные сорта
            томатов, перцев, баклажанов, кукурузы, картофеля, дынь и арбузов.
          </p>
          <p>
            Все семена проходят отбор и проверку на всхожесть, поэтому вы можете
            быть уверены в богатом урожае. Мы работаем напрямую с
            производителями и любим то, что делаем.
          </p>
          <p>
            Отправляем заказы почтой и курьерскими службами по всей России.
            Если у вас есть вопросы — напишите нам, и мы поможем выбрать
            подходящие сорта для вашего участка.
          </p>
        </div>
        <p className="mt-6 text-sm text-brand-500">
          Этот текст можно отредактировать в файле{" "}
          <code className="rounded bg-brand-100 px-1">app/about/page.tsx</code>.
        </p>
      </div>
    </div>
  );
}
