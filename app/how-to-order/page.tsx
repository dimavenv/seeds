import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Как заказать и оплатить — Tomat Semena" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Добавьте в корзину",
    body: (
      <>
        <p>
          Выбирайте понравившиеся сорта нажатием кнопки «Добавить в корзину».
        </p>
        <p>
          На данном этапе товары можно как добавлять, так и удалять, а также
          редактировать их количество.
        </p>
      </>
    ),
  },
  {
    title: "Оформите заказ",
    body: (
      <>
        <p>
          После того как вы добавите все нужные сорта в корзину, на странице с
          корзиной заполните необходимые поля с личной информацией, выберите
          способ доставки и нажмите кнопку «Оформить заказ».
        </p>
        <p>
          <span className="font-semibold text-accent-600">Внимание!</span> После
          нажатия кнопки «Оформить заказ» вы больше не будете видеть список
          выбранных позиций — все товары из корзины будут перенесены в систему
          заказов.
        </p>
      </>
    ),
  },
  {
    title: "Оплатите",
    body: (
      <>
        <p>
          Как только мы получим уведомление о новом заказе, мы свяжемся с вами в
          самое ближайшее время и сообщим номер карты для оплаты.
        </p>
        <p>
          Мы работаем легально в качестве самозанятого лица и платим налоги — нам
          важно, чтобы вы нам доверяли.
        </p>
        <p>
          После оплаты ваш заказ будет готов к сборке, а после отправки мы
          дополнительно уведомим вас.
        </p>
      </>
    ),
  },
];

export default function HowToOrderPage() {
  return (
    <div className="container-page py-12">
      <h1 className="text-center text-3xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-4xl">
        Как заказать <span className="text-accent-500">и оплатить</span>
      </h1>

      <div className="mt-6 space-y-1 text-center text-brand-700">
        <p>Оформление и оплата заказа в нашем магазине обычно не вызывают затруднений.</p>
        <p className="font-semibold">Следуйте шаг за шагом 👇</p>
      </div>

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
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-brand-600">
              {s.body}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link href="/catalog" className="btn-accent">
          Перейти в каталог
        </Link>
      </div>
    </div>
  );
}
