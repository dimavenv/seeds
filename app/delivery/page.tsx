import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Доставка и оплата — Tomat Semena" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Добавьте в корзину",
    body: (
      <p>
        Выбирайте понравившиеся сорта нажатием кнопки «Добавить в корзину». На
        данном этапе товары можно как добавлять, так и удалять, а также
        редактировать их количество.
      </p>
    ),
  },
  {
    title: "Оформите заказ",
    body: (
      <>
        <p>
          Перейдите на страницу корзины и заполните поля с личной информацией.
          Мы рекомендуем выбирать доставку{" "}
          <span className="font-semibold text-accent-600">Ozon</span> — это
          быстро, оперативно и надёжно.
        </p>
        <p>Внимательно укажите адрес в зависимости от выбранного способа:</p>
        <ul className="space-y-2.5">
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#005bff] text-xs font-black text-white">
              O
            </span>
            <span>
              <span className="font-semibold text-brand-800">Через Ozon:</span>{" "}
              точный адрес нужного вам пункта выдачи заказов (ПВЗ). Вы должны
              быть зарегистрированы на Ozon и иметь приложение на смартфоне.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1d71b8] text-sm text-white">
              📮
            </span>
            <span>
              <span className="font-semibold text-brand-800">
                Почтой России:
              </span>{" "}
              ваш полный домашний адрес и почтовый индекс.
            </span>
          </li>
        </ul>
        <p>
          После заполнения данных нажмите кнопку «Оформить заказ» — вы будете
          автоматически перенаправлены на страницу онлайн-оплаты.
        </p>
      </>
    ),
  },
  {
    title: "Оплатите",
    body: (
      <p>
        Оплата производится сразу на сайте (мы работаем по{" "}
        <span className="font-semibold text-accent-600">100% предоплате</span>).
        Мы ведём деятельность легально в статусе индивидуального предпринимателя
        и платим налоги — нам важно, чтобы вы нам доверяли. Сразу после успешной
        оплаты ваш заказ отправляется на сборку, а после его передачи в службу
        доставки мы дополнительно уведомим вас.
      </p>
    ),
  },
];

const IMPORTANT: { icon: string; title: string; body: React.ReactNode }[] = [
  {
    icon: "🚫",
    title: "Ограничения службы Ozon",
    body: (
      <>
        Через Ozon невозможно оформить доставку посылок в{" "}
        <strong>Крым, Калининград и на Камчатку</strong>. Если вы проживаете в
        этих регионах, пожалуйста, выбирайте доставку Почтой России.
      </>
    ),
  },
  {
    icon: "📮",
    title: "Если в вашем населённом пункте нет Ozon",
    body: <>Вы также можете воспользоваться доставкой Почтой России.</>,
  },
  {
    icon: "🌍",
    title: "Международная доставка",
    body: (
      <>
        В зарубежные страны заказы не отправляются. Пересылка семян за границу
        строго запрещена законодательством РФ.
      </>
    ),
  },
];

export default function DeliveryPage() {
  return (
    <div className="container-page py-12">
      <h1 className="text-center text-3xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-4xl">
        Доставка <span className="text-accent-500">и оплата</span>
      </h1>
      <p className="mt-4 text-center text-2xl font-extrabold text-black dark:text-white sm:text-3xl">
        Как оформить и оплатить заказ
      </p>

      {/* Шаги оформления */}
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            style={{ animationDelay: `${i * 100}ms` }}
            className="card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-safe:animate-fade-up"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 text-lg font-extrabold text-white shadow-sm">
              {i + 1}
            </span>
            <h2 className="mt-5 text-lg font-bold text-brand-800">{s.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-brand-700">
              {s.body}
            </div>
          </div>
        ))}
      </div>

      {/* Условия и стоимость */}
      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-center text-2xl font-extrabold text-accent-500 sm:text-3xl">
          Условия и стоимость доставки
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card flex items-start gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl">
              🇷🇺
            </div>
            <div>
              <h3 className="font-bold text-brand-800">По всей России</h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-700">
                Доставка семян осуществляется по всей территории страны.
              </p>
            </div>
          </div>
          <div className="card flex items-start gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl">
              💰
            </div>
            <div>
              <h3 className="font-bold text-brand-800">
                Фиксированно — 300 ₽
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-brand-700">
                Единая стоимость для любого способа — как через Ozon, так и
                Почтой России.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Важная информация */}
      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="text-center text-2xl font-extrabold text-brand-800 sm:text-3xl">
          Важная информация
        </h2>
        <div className="mt-6 space-y-4">
          {IMPORTANT.map((it) => (
            <div key={it.title} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-200 text-xl">
                {it.icon}
              </div>
              <div className="leading-relaxed">
                <h3 className="font-bold text-brand-800">{it.title}</h3>
                <p className="mt-0.5 text-sm text-brand-700">{it.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center">
        <Link href="/catalog" className="btn-accent">
          Перейти в каталог
        </Link>
      </div>
    </div>
  );
}
