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
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";
import DadataAddress, {
  emptyAddress,
  type AddressValue,
} from "@/components/dadata-address";
import OzonPvzField, {
  type OzonPvzSelection,
} from "@/components/ozon-pvz-field";

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
  pvz: OzonPvzSelection | null;
  deliveryMethod: DeliveryMethodId;
};

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
  // Выбранный пункт выдачи Ozon (для способа доставки «Ozon»).
  const [pvz, setPvz] = useState<OzonPvzSelection | null>(null);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const grandTotal = cartTotal + DELIVERY_COST;

  // Подставить сохранённые («Запомнить меня») данные при загрузке.
  useEffect(() => {
    let cancelled = false;
    secureGet<SavedProfile>(PROFILE_KEY).then((saved) => {
      if (cancelled || !saved) return;
      if (saved.form) setForm(saved.form);
      if (saved.address) setAddress(saved.address);
      if (saved.pvz) setPvz(saved.pvz);
      if (saved.deliveryMethod) setDeliveryMethod(saved.deliveryMethod);
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

    // Адрес зависит от способа доставки: Ozon — одна строка (адрес ПВЗ),
    // Почта — структурный адрес с индексом.
    let addressStr: string;
    if (deliveryMethod === "ozon") {
      if (!pvz) {
        setError("Выберите пункт выдачи Ozon на карте или в списке");
        return;
      }
      addressStr = `Пункт выдачи Ozon [${pvz.code}]: ${pvz.address}`;
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
      // Улицу пишем как есть — подсказки DaData уже дают её с типом («ул Баумана»),
      // повторный префикс «ул.» дал бы «ул. ул Баумана».
      addressStr = [
        address.postal_code.trim(),
        address.region.trim(),
        address.city.trim(),
        address.street.trim(),
        address.house.trim() && `д. ${address.house.trim()}`,
        address.flat.trim() && `кв. ${address.flat.trim()}`,
      ]
        .filter(Boolean)
        .join(", ");
    }

    if (captchaEnabled && !captchaToken) {
      setError("Подтвердите, что вы не робот");
      return;
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
          captchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка оформления заказа");
        setSubmitting(false);
        // Токен капчи одноразовый — сбрасываем виджет для повторной попытки.
        setCaptchaToken("");
        setCaptchaReset((n) => n + 1);
        return;
      }
      // «Запомнить меня»: сохранить зашифрованно или очистить.
      if (remember) {
        secureSet(PROFILE_KEY, { form, address, pvz, deliveryMethod });
      } else {
        secureClear(PROFILE_KEY);
      }

      // Онлайн-оплата подключена — переходим на платёжную форму Альфа-Банка.
      // Корзину НЕ чистим: если оплата не пройдёт, товары останутся у
      // покупателя (очистка — на странице заказа при возврате с ?paid=1).
      if (data.formUrl) {
        window.location.href = data.formUrl;
        return;
      }

      // Заказ без онлайн-оплаты оформлен окончательно — корзину можно чистить.
      clearCart();
      const qs = new URLSearchParams({
        total: String(data.total),
        name: form.first_name || customer_name,
      });
      router.push(`/order/${data.id}?${qs.toString()}`);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setSubmitting(false);
      setCaptchaToken("");
      setCaptchaReset((n) => n + 1);
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
      {/* min-w-0 на колонках: иначе грид не даёт им ужаться под узкий экран
          и страницу распирает вбок (у грид-элементов min-width: auto). */}
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="card min-w-0 space-y-6 p-5 lg:col-span-2">
          {/* 1. Способ доставки — выбираем первым, от него зависит адрес */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Способ доставки
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {DELIVERY_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                    deliveryMethod === m.id
                      ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                      : "border-brand-200 hover:bg-brand-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery_method"
                    value={m.id}
                    checked={deliveryMethod === m.id}
                    onChange={() => setDeliveryMethod(m.id)}
                    className="mt-0.5 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-brand-800">
                        {m.label}
                      </span>
                      <span className="text-sm text-brand-500">
                        · {formatPrice(DELIVERY_COST)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-brand-500">
                      {m.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 2. Получатель */}
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

          {/* 3. Адрес — зависит от способа доставки */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              {deliveryMethod === "ozon" ? "Пункт выдачи" : "Адрес доставки"}
            </legend>
            {deliveryMethod === "ozon" ? (
              <OzonPvzField value={pvz} onChange={setPvz} />
            ) : (
              <DadataAddress value={address} onChange={setAddress} />
            )}
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

        <div className="card h-fit min-w-0 p-5">
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

          <SmartCaptcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          <button
            type="submit"
            disabled={
              submitting ||
              !consent ||
              (captchaEnabled && !captchaToken) ||
              (deliveryMethod === "ozon" && !pvz)
            }
            className="btn-accent mt-5 w-full"
          >
            {submitting ? "Оформляем…" : "Подтвердить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}
