"use client";

import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import { CartIcon } from "@/components/icons";

export default function CartPage() {
  const { cart, cartTotal, setQty, removeFromCart, ready } = useStore();

  if (!ready) {
    return <div className="container-page py-10 text-brand-500">Загрузка…</div>;
  }

  if (cart.length === 0) {
    return (
      <div className="container-page py-16 text-center motion-safe:animate-fade-up">
        <CartIcon className="mx-auto h-12 w-12 text-brand-300 motion-safe:animate-float" />
        <h1 className="mt-4 text-2xl font-bold text-brand-800">Корзина пуста</h1>
        <p className="mt-2 text-brand-500">
          Добавьте семена из каталога, чтобы оформить заказ.
        </p>
        <Link href="/catalog" className="btn-primary mt-6">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <h1 className="mb-6 text-2xl font-bold text-brand-800">Корзина</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {cart.map((item) => (
            <div
              key={item.id}
              className="card flex flex-wrap items-center gap-3 p-3 motion-safe:animate-fade-up sm:gap-4"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                {item.image_url && (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 basis-36">
                <Link
                  href={`/product/${item.slug}`}
                  className="line-clamp-2 font-semibold text-brand-800 transition-colors hover:text-brand-600"
                >
                  {item.name}
                </Link>
                <div className="text-sm text-brand-500">
                  {formatPrice(item.price)} / шт.
                </div>
              </div>
              {/* На мобильных управление переносится на отдельную строку. */}
              <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                <div className="flex items-center rounded-full border border-brand-200">
                  <button
                    onClick={() => setQty(item.id, item.qty - 1)}
                    className="px-3 py-1.5 text-brand-600 transition-colors hover:text-brand-800 motion-safe:active:scale-90"
                    aria-label="Меньше"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {item.qty}
                  </span>
                  <button
                    onClick={() => setQty(item.id, item.qty + 1)}
                    className="px-3 py-1.5 text-brand-600 transition-colors hover:text-brand-800 motion-safe:active:scale-90"
                    aria-label="Больше"
                  >
                    +
                  </button>
                </div>
                <div className="w-24 text-right font-bold text-brand-700">
                  {formatPrice(item.price * item.qty)}
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="rounded-full p-2 text-sm text-brand-400 transition-colors hover:bg-brand-50 hover:text-accent-600"
                  aria-label="Удалить"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card h-fit p-5">
          <h2 className="text-lg font-bold text-brand-800">Итого</h2>
          <div className="mt-4 flex justify-between text-brand-700">
            <span>Товары ({cart.reduce((s, i) => s + i.qty, 0)})</span>
            <span className="font-semibold">{formatPrice(cartTotal)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4 text-sm text-brand-500">
            <span>Доставка</span>
            <span className="text-right">рассчитывается при оформлении</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-brand-100 pt-4 text-lg font-extrabold text-brand-800">
            <span>К оплате</span>
            <span>{formatPrice(cartTotal)}</span>
          </div>
          <Link href="/checkout" className="btn-accent mt-5 w-full">
            Оформить заказ
          </Link>
          <Link href="/catalog" className="btn-outline mt-2 w-full">
            Продолжить покупки
          </Link>
        </div>
      </div>
    </div>
  );
}
