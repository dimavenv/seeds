"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";

export default function CheckoutPage() {
  const { cart, cartTotal, clearCart, ready } = useStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    address: "",
    comment: "",
  });

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
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
        name: form.customer_name,
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
        <div className="card space-y-4 p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-700">
                Имя и фамилия *
              </span>
              <input required value={form.customer_name} onChange={update("customer_name")} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-700">
                Телефон *
              </span>
              <input required type="tel" value={form.phone} onChange={update("phone")} className="input" placeholder="+7 ___ ___-__-__" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Email
            </span>
            <input type="email" value={form.email} onChange={update("email")} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Адрес доставки *
            </span>
            <input required value={form.address} onChange={update("address")} className="input" placeholder="Индекс, город, улица, дом, квартира" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Комментарий к заказу
            </span>
            <textarea value={form.comment} onChange={update("comment")} className="input min-h-24" />
          </label>
          <p className="text-xs text-brand-500">
            Оплата при получении или по счёту. Менеджер свяжется с вами для
            подтверждения заказа и расчёта доставки.
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
          <div className="mt-4 flex justify-between border-t border-brand-100 pt-4 text-lg font-extrabold text-brand-800">
            <span>Итого</span>
            <span>{formatPrice(cartTotal)}</span>
          </div>
          <button type="submit" disabled={submitting} className="btn-accent mt-5 w-full">
            {submitting ? "Оформляем…" : "Подтвердить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}
