"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import {
  DELIVERY_COST,
  DELIVERY_METHODS,
  type DeliveryMethodId,
} from "@/lib/delivery";
import DadataAddress, {
  emptyAddress,
  type AddressValue,
} from "@/components/dadata-address";

export default function CheckoutPage() {
  const { cart, cartTotal, clearCart, ready } = useStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    phone: "",
    email: "",
    comment: "",
  });
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethodId>("ozon");
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const grandTotal = cartTotal + DELIVERY_COST;

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Собираем ФИО и адрес из раздельных полей.
    const customer_name = [form.last_name, form.first_name, form.middle_name]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    const missingAddress =
      !address.postal_code.trim() ||
      !address.city.trim() ||
      !address.street.trim() ||
      !address.house.trim();
    if (missingAddress) {
      setError("Заполните индекс, город, улицу и дом");
      return;
    }

    const addressStr = [
      address.postal_code.trim(),
      address.region.trim(),
      address.city.trim(),
      address.street.trim() && `ул. ${address.street.trim()}`,
      address.house.trim() && `д. ${address.house.trim()}`,
      address.flat.trim() && `кв. ${address.flat.trim()}`,
    ]
      .filter(Boolean)
      .join(", ");

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name,
          phone: form.phone,
          email: form.email,
          address: addressStr,
          comment: form.comment,
          delivery_method: deliveryMethod,
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка оформления заказа");
        setSubmitting(false);
        return;
      }
      clearCart();
      const qs = new URLSearchParams({
        total: String(data.total),
        name: form.first_name || customer_name,
      });
      router.push(`/order/${data.id}?${qs.toString()}`);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setSubmitting(false);
    }
  }

  if (ready && cart.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-800">Корзина пуста</h1>
        <p className="mt-2 text-brand-500">Добавьте товары перед оформлением.</p>
        <Link href="/catalog" className="btn-primary mt-6">
          В каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <h1 className="mb-6 text-2xl font-bold text-brand-800">Оформление заказа</h1>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-6 p-5 lg:col-span-2">
          {/* ФИО */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Получатель
            </legend>
            <p className="text-xs text-brand-500">
              Укажите ФИО полностью, без сокращений.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Фамилия *
                </span>
                <input required value={form.last_name} onChange={update("last_name")} className="input" placeholder="Иванов" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Имя *
                </span>
                <input required value={form.first_name} onChange={update("first_name")} className="input" placeholder="Иван" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Отчество
                </span>
                <input value={form.middle_name} onChange={update("middle_name")} className="input" placeholder="Иванович" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Телефон *
                </span>
                <input required type="tel" value={form.phone} onChange={update("phone")} className="input" placeholder="+7 ___ ___-__-__" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Email
                </span>
                <input type="email" value={form.email} onChange={update("email")} className="input" />
              </label>
            </div>
          </fieldset>

          {/* Адрес доставки */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Адрес доставки
            </legend>
            <DadataAddress value={address} onChange={setAddress} />
          </fieldset>

          {/* Способ доставки */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Способ доставки
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {DELIVERY_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                    deliveryMethod === m.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-brand-200 hover:bg-brand-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery_method"
                    value={m.id}
                    checked={deliveryMethod === m.id}
                    onChange={() => setDeliveryMethod(m.id)}
                    className="accent-brand-600"
                  />
                  <span className="font-semibold text-brand-800">{m.label}</span>
                  <span className="ml-auto text-sm text-brand-500">
                    {formatPrice(DELIVERY_COST)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Комментарий к заказу
            </span>
            <textarea value={form.comment} onChange={update("comment")} className="input min-h-24" />
          </label>
          <p className="text-xs text-brand-500">
            Оплата при получении. Доставка Ozon или Почтой России —{" "}
            {formatPrice(DELIVERY_COST)} по всей России.
          </p>
          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">
              {error}
            </p>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="text-lg font-bold text-brand-800">Ваш заказ</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {cart.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 text-brand-700">
                <span className="min-w-0 truncate">
                  {i.name} × {i.qty}
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {formatPrice(i.price * i.qty)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-brand-100 pt-4 text-sm text-brand-700">
            <div className="flex justify-between">
              <span>Товары</span>
              <span>{formatPrice(cartTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Доставка</span>
              <span>{formatPrice(DELIVERY_COST)}</span>
            </div>
          </div>
          <div className="mt-3 flex justify-between border-t border-brand-100 pt-3 text-lg font-extrabold text-brand-800">
            <span>Итого</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
          <button type="submit" disabled={submitting} className="btn-accent mt-5 w-full">
            {submitting ? "Оформляем…" : "Подтвердить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}
