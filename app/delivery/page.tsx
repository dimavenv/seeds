import type { Metadata } from "next";

export const metadata: Metadata = { title: "Доставка и оплата — Tomat Semena" };

const CARDS: { icon: string; title: string; body: React.ReactNode }[] = [
  {
    icon: "📦",
    title: "Отправка",
    body: (
      <>
        <p>
          Рекомендуем выбирать доставку{" "}
          <span className="font-semibold text-accent-600">Озон</span> —
          оперативно, надёжно, приемлемая стоимость.
        </p>
        <p>
          Также можем выслать Почтой России. Решение вы принимаете
          самостоятельно.
        </p>
      </>
    ),
  },
  {
    icon: "💳",
    title: "Цена",
    body: (
      <>
        <p>
          <span className="font-semibold text-accent-600">300 ₽</span> службой
          Озон и заказным письмом Почтой России. Посылка Почтой рассчитывается
          индивидуально и зависит от удалённости региона.
        </p>
        <p>
          В зарубежные страны не отправляем — пересылка семян за границу
          запрещена законодательством РФ.
        </p>
      </>
    ),
  },
  {
    icon: "✅",
    title: "Условия",
    body: (
      <>
        <p>
          Доставка осуществляется по{" "}
          <span className="font-semibold text-accent-600">100% предоплате</span>.
        </p>
        <p>
          Отправка наложенным платежом возможна только при условии личной
          договорённости (пишите в WhatsApp, Telegram или на Email — мы всегда
          идём вам навстречу).
        </p>
      </>
    ),
  },
];

export default function DeliveryPage() {
  return (
    <div className="container-page py-12">
      <h1 className="text-center text-3xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-4xl">
        Доставка семян <span className="text-accent-500">по всей</span> России
      </h1>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-3">
        {CARDS.map((c, i) => (
          <div
            key={c.title}
            style={{ animationDelay: `${i * 90}ms` }}
            className="card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-safe:animate-fade-up"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
              {c.icon}
            </div>
            <h2 className="mt-5 text-sm font-bold uppercase tracking-wide text-brand-800">
              {c.title}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-brand-600">
              {c.body}
            </div>
          </div>
        ))}
      </div>

      {/* Дополнительная информация */}
      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-center text-2xl font-extrabold text-accent-500 sm:text-3xl">
          Дополнительная информация
        </h2>
        <div className="mt-6 flex items-start gap-4">
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-brand-200 text-2xl sm:flex">
            💡
          </div>
          <div className="space-y-4 leading-relaxed text-brand-700">
            <h3 className="text-xl font-bold text-brand-800">
              Мы отдаём предпочтение службе доставки Озон
            </h3>
            <p>
              При заказе доставки Озоном вы должны быть зарегистрированы, и у вас
              должно быть установлено приложение{" "}
              <span className="font-semibold text-accent-600">Озон</span> на
              смартфоне.
            </p>
            <p>
              Если в вашем населённом пункте нет{" "}
              <strong>ПВЗ Озон</strong>, вы можете выбрать доставку Почтой
              России.
            </p>
            <p>
              Стоимость доставки <strong>посылкой</strong> Почтой России
              рассчитывается индивидуально и зависит от удалённости от
              отправителя.
            </p>
            <p>
              Способ отправки{" "}
              <span className="text-accent-600">заказным письмом</span> с
              товарным вложением запрещён, поэтому{" "}
              <span className="underline">мы не несём ответственности</span> и не
              можем дать гарантию получения заказа таким способом. Однако на
              практике этим способом многие успешно пользуются — отправления
              доходят в 99% случаев (решение вы принимаете самостоятельно!).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
