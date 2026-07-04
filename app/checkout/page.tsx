"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import {
  DELIVERY_COST,
  DELIVERY_METHODS,
  type DeliveryMethodId,
} from "@/lib/delivery";
import {
  secureGet,
  secureSet,
  secureClear,
} from "@/lib/secure-store";
import ConsentCheckbox from "@/components/consent-checkbox";
import DadataAddress, {
  emptyAddress,
  DadataAddressLine,
  type AddressValue,
} from "@/components/dadata-address";

const PROFILE_KEY = "checkout_profile";

type SavedProfile = {
  form: {
    last_name: string;
    first_name: string;
    middle_name: string;
    phone: string;
    email: string;
    comment: string;
  };
  address: AddressValue;
  deliveryMethod: DeliveryMethodId;
  pickup?: string; // адрес ПВЗ Ozon (в старых сохранениях отсутствует)
};

// Пояснения к способам доставки в начале формы.
const METHOD_HINTS: Record<DeliveryMethodId, string> = {
  ozon: "В пункт выдачи заказов Ozon",
  post: "На домашний адрес по индексу",
};

type InsufficientItem = { id: number; available: number; name?: string };

export default function CheckoutPage() {
  const { cart, cartTotal, clearCart, setQty, removeFromCart, ready } =
    useStore();
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
  const [pickup, setPickup] = useState("");
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const grandTotal = cartTotal + DELIVERY_COST;

  // Подставить сохранённые («Запомнить меня») данные при загрузке.
  useEffect(() => {
    let cancelled = false;
    secureGet<SavedProfile>(PROFILE_KEY).then((saved) => {
      if (cancelled || !saved) return;
      if (saved.form) setForm(saved.form);
      if (saved.address) setAddress(saved.address);
      if (saved.deliveryMethod) setDeliveryMethod(saved.deliveryMethod);
      if (saved.pickup) setPickup(saved.pickup);
      setRemember(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Сервер ответил, что каких-то товаров не хватает: поджимаем корзину под
  // фактическое наличие и объясняем, что изменилось.
  function applyInsufficient(list: InsufficientItem[]) {
    const details: string[] = [];
    for (const s of list) {
      const name = s.name ?? cart.find((i) => i.id === s.id)?.name ?? `товар #${s.id}`;
      if (s.available <= 0) {
        removeFromCart(s.id);
        details.push(`«${name}» закончился и убран из корзины`);
      } else {
        setQty(s.id, s.available);
        details.push(`«${name}» — осталось ${s.available} шт., количество уменьшено`);
      }
    }
    setError(
      `Наличие изменилось, пока вы оформляли заказ: ${details.join("; ")}. ` +
        "Проверьте корзину и подтвердите заказ ещё раз."
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!consent) {
      setError("Подтвердите согласие на обработку персональных данных");
      return;
    }

    // Собираем ФИО и адрес из раздельных полей.
    const customer_name = [form.last_name, form.first_name, form.middle_name]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    let addressStr: string;
    if (deliveryMethod === "ozon") {
      if (!pickup.trim()) {
        setError("Укажите адрес пункта выдачи заказов Ozon");
        return;
      }
      addressStr = `ПВЗ Ozon: ${pickup.trim()}`;
    } else {
      const missingAddress =
        !address.postal_code.trim() ||
        !address.city.trim() ||
        !address.street.trim() ||
        !address.house.trim();
      if (missingAddress) {
        setError("Заполните индекс, город, улицу и дом");
        return;
      }
      addressStr = [
        address.postal_code.trim(),
        address.region.trim(),
        address.city.trim(),
        address.street.trim() && `ул. ${address.street.trim()}`,
        address.house.trim() && `д. ${address.house.trim()}`,
        address.flat.trim() && `кв. ${address.flat.trim()}`,
      ]
        .filter(Boolean)
        .join(", ");
    }

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
        // 409 — база сообщила, что наличия не хватает.
        if (res.status === 409 && Array.isArray(data.insufficient)) {
          applyInsufficient(data.insufficient as InsufficientItem[]);
        } else {
          setError(data.error ?? "Ошибка оформления заказа");
        }
        setSubmitting(false);
        return;
      }
      // «Запомнить меня»: сохранить зашифрованно или очистить.
      if (remember) {
        secureSet(PROFILE_KEY, { form, address, deliveryMethod, pickup });
      } else {
        secureClear(PROFILE_KEY);
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
          {/* Способ доставки — первым: от него зависит форма адреса */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Способ доставки
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {DELIVERY_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
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
                    className="mt-1 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-brand-800">
                        {m.label}
                      </span>
                      <span className="whitespace-nowrap text-sm text-brand-500">
                        {formatPrice(DELIVERY_COST)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-brand-500">
                      {METHOD_HINTS[m.id]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Адрес — зависит от способа доставки */}
          {deliveryMethod === "ozon" ? (
            <fieldset className="space-y-3">
              <legend className="text-base font-bold text-brand-800">
                Пункт выдачи Ozon
              </legend>
              <p className="text-sm text-brand-500">
                Укажите точный адрес нужного вам пункта выдачи заказов (ПВЗ).
                Вы должны быть зарегистрированы на{" "}
                <span className="font-semibold text-accent-600">Ozon</span> и
                иметь приложение на смартфоне.
              </p>
              <DadataAddressLine
                label="Адрес пункта выдачи (ПВЗ)"
                required
                value={pickup}
                onChange={setPickup}
                placeholder="Город, улица, дом — где вам удобно забирать"
              />
            </fieldset>
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-base font-bold text-brand-800">
                Адрес доставки
              </legend>
              <p className="text-sm text-brand-500">
                Для доставки{" "}
                <span className="font-semibold text-accent-600">
                  Почтой России
                </span>{" "}
                укажите ваш полный домашний адрес и почтовый индекс.
              </p>
              <DadataAddress value={address} onChange={setAddress} />
            </fieldset>
          )}

          {/* ФИО и контакты */}
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

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Комментарий к заказу
            </span>
            <textarea value={form.comment} onChange={update("comment")} className="input min-h-24" />
          </label>
          <p className="text-xs text-brand-500">
            Доставка Ozon или Почтой России — {formatPrice(DELIVERY_COST)} по
            всей России.
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

          <div className="mt-4 space-y-3 border-t border-brand-100 pt-4">
            <ConsentCheckbox checked={consent} onChange={setConsent} />
            <label className="flex cursor-pointer items-start gap-2 text-sm text-brand-700">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                Запомнить меня — сохранить данные на этом устройстве
                (зашифрованно) для следующего заказа.
              </span>
            </label>
          </div>

          <button type="submit" disabled={submitting || !consent} className="btn-accent mt-5 w-full">
            {submitting ? "Проверяем наличие…" : "Подтвердить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}
