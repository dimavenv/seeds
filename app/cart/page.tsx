"use client";

import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import { DELIVERY_COST, FREE_DELIVERY_FROM } from "@/lib/delivery";
import { CartIcon } from "@/components/icons";
import PromoField from "@/components/promo-field";
import Spinner from "@/components/spinner";

export default function CartPage() {
  const { cart, cartTotal, discount, setQty, removeFromCart, ready } =
    useStore();
  const deliveryFree = cartTotal >= FREE_DELIVERY_FROM;
  // Скидка по промокоду уменьшает только стоимость товаров: порог бесплатной
  // доставки считается от суммы ДО скидки (так же на оформлении и на сервере).
  const payable = Math.max(0, cartTotal - discount) + (deliveryFree ? 0 : DELIVERY_COST);

  if (!ready) {
    return (
      <div
        className="container-page flex items-center gap-3 py-10 text-brand-500"
        role="status"
      >
        <Spinner /> Загрузка…
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <CartIcon className="mx-auto h-12 w-12 text-brand-300" />
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
      {/* min-w-0 на колонках: иначе грид не даёт им ужаться под узкий экран
          и страницу распирает вбок (у грид-элементов min-width: auto). */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          {cart.map((item) => (
            // На телефоне строка складывается в два ряда: фото+название,
            // ниже — количество/сумма/удалить. С sm — всё в один ряд.
            <div key={item.id} className="card flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-50 sm:h-20 sm:w-20">
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
              <div className="min-w-0 flex-1 basis-32">
                <Link
                  href={`/product/${item.slug}`}
                  className="line-clamp-2 font-semibold text-brand-800 hover:text-brand-600"
                >
                  {item.name}
                </Link>
                <div className="text-sm text-brand-500">
                  {formatPrice(item.price)} / шт.
                </div>
              </div>
              <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
                <div className="flex shrink-0 items-center rounded-full border border-brand-200">
                  <button
                    onClick={() => setQty(item.id, item.qty - 1)}
                    disabled={item.qty <= 1}
                    className="px-3 py-1.5 text-brand-600 disabled:opacity-40"
                    aria-label="Меньше"
                    title={
                      item.qty <= 1
                        ? "Минимум 1 шт. — убрать товар можно крестиком"
                        : undefined
                    }
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {item.qty}
                  </span>
                  <button
                    onClick={() => setQty(item.id, item.qty + 1)}
                    disabled={
                      typeof item.stock === "number" && item.qty >= item.stock
                    }
                    className="px-3 py-1.5 text-brand-600 disabled:opacity-40"
                    aria-label="Больше"
                    title={
                      typeof item.stock === "number" && item.qty >= item.stock
                        ? "Больше нет в наличии"
                        : undefined
                    }
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right font-bold text-brand-700 sm:w-24">
                    {formatPrice(item.price * item.qty)}
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-sm text-brand-400 hover:text-accent-600"
                    aria-label="Удалить"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card h-fit min-w-0 p-5">
          <h2 className="text-lg font-bold text-brand-800">Итого</h2>
          <div className="mt-4 flex justify-between text-brand-700">
            <span>Товары ({cart.reduce((s, i) => s + i.qty, 0)})</span>
            <span className="font-semibold">{formatPrice(cartTotal)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-brand-500">
            <span>Доставка</span>
            {deliveryFree ? (
              <span className="font-semibold text-brand-600">бесплатно</span>
            ) : (
              <span>{formatPrice(DELIVERY_COST)}</span>
            )}
          </div>
          {deliveryFree ? (
            <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-600">
              🎉 Доставка для вас бесплатна — заказ от{" "}
              {formatPrice(FREE_DELIVERY_FROM)}.
            </p>
          ) : (
            <p className="mt-2 text-xs text-brand-400">
              Доставка бесплатно при заказе от {formatPrice(FREE_DELIVERY_FROM)}{" "}
              (осталось {formatPrice(FREE_DELIVERY_FROM - cartTotal)}).
            </p>
          )}
          {/* Промокод — прямо перед строкой «К оплате» */}
          <PromoField />
          {discount > 0 && (
            <div className="mt-3 flex justify-between gap-2 text-sm font-semibold text-brand-600">
              {/* Код уже показан в плашке выше — здесь только сумма скидки,
                  иначе строка не помещается в узкую колонку «Итого». */}
              <span>Скидка по промокоду</span>
              <span className="whitespace-nowrap">−{formatPrice(discount)}</span>
            </div>
          )}
          <div className="mt-4 flex justify-between border-t border-brand-100 pt-4 text-lg font-extrabold text-brand-800">
            <span>К оплате</span>
            <span>{formatPrice(payable)}</span>
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
