import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Как заказать — Semena Collection" };

const steps = [
  ["Выберите товары", "Откройте каталог, найдите нужные сорта и нажмите «В корзину»."],
  ["Перейдите в корзину", "Проверьте состав заказа и количество, при необходимости измените."],
  ["Оформите заказ", "Укажите имя, телефон и адрес доставки на странице оформления."],
  ["Подтверждение", "Менеджер свяжется с вами, уточнит детали и рассчитает доставку."],
];

export default function HowToOrderPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Как заказать</h1>
        <p className="mt-3 text-brand-700">
          Сделать заказ в Semena Collection просто — всего 4 шага:
        </p>
        <ol className="mt-6 space-y-4">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-white">
                {i + 1}
              </span>
              <div>
                <div className="font-semibold text-brand-800">{title}</div>
                <div className="text-sm text-brand-600">{text}</div>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/catalog" className="btn-accent mt-8">
          Перейти в каталог
        </Link>
      </div>
    </div>
  );
}
