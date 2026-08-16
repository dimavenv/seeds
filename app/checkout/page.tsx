"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import {
  DELIVERY_COST,
  FREE_DELIVERY_FROM,
  deliveryCostFor,
  ozonRestrictedRegion,
  type DeliveryMethodId,
} from "@/lib/delivery";
import DeliveryMethodCards from "@/components/delivery-method-cards";
import { parsePromoRule } from "@/lib/promo";
import {
  secureGet,
  secureSet,
  secureClear,
} from "@/lib/secure-store";
import { localPhoneDigits, normalizePhone, type Profile } from "@/lib/profile";
import { submitPaymentForm } from "@/lib/payment-form";
import PhoneInput from "@/components/phone-input";
import ConsentCheckbox from "@/components/consent-checkbox";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";
import DadataAddress, {
  emptyAddress,
  type AddressValue,
} from "@/components/dadata-address";
import OzonPvzField from "@/components/ozon-pvz-field";
import Spinner from "@/components/spinner";
import { GOALS, reachGoal, stashPurchase } from "@/lib/metrika";

const PROFILE_KEY = "checkout_profile";

// Пустая форма получателя — и начальное состояние, и база для слияния с
// данными личного кабинета.
const EMPTY_FORM = {
  last_name: "",
  first_name: "",
  middle_name: "",
  phone: "",
  email: "",
  comment: "",
};

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
  pvz: string;
  deliveryMethod: DeliveryMethodId;
};

export default function CheckoutPage() {
  const {
    cart,
    cartTotal,
    clearCart,
    ready,
    promo,
    discount,
    applyPromo,
    clearPromo,
  } = useStore();
  const router = useRouter();
  // Сообщение о промокоде, который перестал действовать (использован с
  // другого устройства, отключён продавцом, вышли из аккаунта).
  const [promoNotice, setPromoNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // Что-то подставилось из личного кабинета — говорим об этом покупателю,
  // чтобы чужие на вид данные в форме не пугали.
  const [fromProfile, setFromProfile] = useState(false);
  // Покупатель уже начал заполнять форму сам — тогда подстановка из кабинета
  // (она приезжает запросом и может опоздать) в его текст не лезет.
  const formTouched = useRef(false);
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethodId>("ozon");
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  // Написанный покупателем пункт выдачи Ozon (для способа доставки «Ozon»).
  const [pvz, setPvz] = useState("");
  // Код региона (KLADR) выбранного из подсказок ПВЗ — для проверки Ozon на
  // сервере по нормализованному региону, а не по свободному тексту (аудит 2.6).
  const [pvzRegionKladr, setPvzRegionKladr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  // Стоимость доставки зависит от способа: Почтой России — бесплатно от
  // FREE_DELIVERY_FROM, Ozon — всегда DELIVERY_COST.
  const deliveryCost = deliveryCostFor(deliveryMethod, cartTotal);
  // Скидка по промокоду снимается только с товаров: порог бесплатной доставки
  // считается от суммы ДО скидки — так же, как в корзине и на сервере.
  const grandTotal = Math.max(0, cartTotal - discount) + deliveryCost;

  // Цель «начал оформление» — один раз за загрузку страницы и только когда
  // корзина уже поднялась из localStorage и в ней что-то есть (пустая корзина
  // сразу показывает заглушку, засчитывать такой заход нечестно).
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (!ready || cart.length === 0 || checkoutTracked.current) return;
    checkoutTracked.current = true;
    reachGoal(GOALS.beginCheckout, {
      items: cart.reduce((s, i) => s + i.qty, 0),
      total: cartTotal,
    });
  }, [ready, cart, cartTotal]);

  // Подставить данные при загрузке: сначала сохранённые на этом устройстве
  // («Запомнить меня») — они самые свежие, потом ФИО/телефон/почту из личного
  // кабинета в те поля, что остались пустыми. Изменения здесь профиль не
  // трогают: заказ можно оформить и на другого получателя.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await secureGet<SavedProfile>(PROFILE_KEY).catch(() => null);
      if (cancelled) return;
      if (saved) {
        if (saved.form) setForm(saved.form);
        if (saved.address) setAddress(saved.address);
        // Раньше сюда сохранялся объект выбранного ПВЗ — теперь это строка;
        // старые сохранённые профили с объектом просто игнорируем.
        if (typeof saved.pvz === "string") setPvz(saved.pvz);
        if (saved.deliveryMethod) setDeliveryMethod(saved.deliveryMethod);
        setRemember(true);
      }

      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const p = (await res.json()) as Partial<Profile> & {
          authorized?: boolean;
          email?: string | null;
        };
        if (cancelled || !p.authorized || formTouched.current) return;
        // База — то, что уже лежит в форме: сохранённый профиль устройства или
        // пустые поля. Считаем её здесь, а не в updater'е setForm, чтобы
        // сравнение «что подставилось» осталось чистым.
        const base = { ...EMPTY_FORM, ...(saved?.form ?? {}) };
        const merged = {
          ...base,
          last_name: base.last_name || (p.last_name ?? ""),
          first_name: base.first_name || (p.first_name ?? ""),
          middle_name: base.middle_name || (p.middle_name ?? ""),
          phone: base.phone || normalizePhone(p.phone ?? ""),
          email: base.email || (p.email ?? ""),
        };
        setForm(merged);
        setFromProfile(
          merged.last_name !== base.last_name ||
            merged.first_name !== base.first_name ||
            merged.phone !== base.phone ||
            merged.email !== base.email
        );
      } catch {
        // кабинет недоступен — просто оставляем форму пустой
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Перед оплатой перепроверяем промокод на сервере: в localStorage он мог
  // остаться от прошлого заказа, быть потрачен с другого устройства или
  // подправлен вручную. Показанная скидка после этого совпадает с той, что
  // посчитает /api/checkout, а не расходится с суммой списания.
  const promoCode = promo?.code ?? null;
  useEffect(() => {
    if (!promoCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          promo?: unknown;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && data.ok) {
          const rule = parsePromoRule(data.promo);
          if (rule) applyPromo(rule);
          return;
        }
        // 503 — база/сеть не ответили: код не трогаем, его всё равно
        // перепроверит оформление.
        if (res.status === 503) return;
        clearPromo();
        setPromoNotice(data.error ?? "Промокод больше не действует");
      } catch {
        // сеть недоступна — решение примет сервер при оформлении
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [promoCode, applyPromo, clearPromo]);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      formTouched.current = true;
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!consent) {
      setError("Подтвердите согласие на обработку персональных данных");
      return;
    }

    // Номер должен быть полным: по нему звонит курьер, а недобранная цифра
    // выясняется уже на доставке.
    if (localPhoneDigits(form.phone).length !== 10) {
      setError("Проверьте номер телефона — нужно 10 цифр после +7");
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
      if (!pvz.trim()) {
        setError("Напишите адрес пункта выдачи Ozon");
        return;
      }
      const restricted = ozonRestrictedRegion(pvz);
      if (restricted) {
        setError(
          `Доставка Ozon в регион «${restricted}» недоступна. Выберите другой пункт выдачи или Почту России.`
        );
        return;
      }
      addressStr = `Пункт выдачи Ozon: ${pvz.trim()}`;
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
    reachGoal(GOALS.submitOrder, { total: grandTotal });
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
          region_kladr: deliveryMethod === "ozon" ? pvzRegionKladr : null,
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
          // Только сам код: размер скидки сервер считает по своим правилам.
          promo_code: promo?.code ?? null,
          captchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка оформления заказа");
        // Заказ отклонён из-за промокода — снимаем его, чтобы повторная
        // отправка прошла уже без скидки, а не упёрлась в ту же ошибку.
        if (data.promoError) {
          clearPromo();
          setPromoNotice(null);
        }
        setSubmitting(false);
        // Токен капчи одноразовый — сбрасываем виджет для повторной попытки.
        setCaptchaToken("");
        setCaptchaReset((n) => n + 1);
        return;
      }
      // Состав заказа для цели «покупка». Саму цель засчитывает страница
      // подтверждения: при онлайн-оплате между этим моментом и оплатой лежит
      // платёжная страница Robokassa, и заказ ещё может сорваться. Здесь только
      // складываем состав — на странице «спасибо» его уже неоткуда взять
      // (корзина к тому времени очищена).
      //
      // При онлайн-оплате заказа ещё не существует (он создаётся после оплаты),
      // поэтому складываем состав под номером счёта — страница подтверждения
      // получит его параметром inv и сверит по нему.
      stashPurchase({
        orderId: String(data.invoiceId ?? data.id),
        revenue: Number(data.total) || grandTotal,
        coupon: promo?.code,
        products: cart.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.qty,
        })),
      });

      // «Запомнить меня»: сохранить зашифрованно или очистить.
      if (remember) {
        secureSet(PROFILE_KEY, { form, address, pvz, deliveryMethod });
      } else {
        secureClear(PROFILE_KEY);
      }

      // Онлайн-оплата подключена — уходим на платёжную страницу Robokassa.
      // Корзину НЕ чистим: если оплата не пройдёт, товары останутся у
      // покупателя (очистка — на странице заказа при возврате с ?paid=1).
      if (data.payment?.url && data.payment?.fields) {
        submitPaymentForm(data.payment.url, data.payment.fields);
        return;
      }

      // Заказ без онлайн-оплаты оформлен окончательно — корзину можно чистить.
      clearCart();
      clearPromo(); // код уже потрачен на этом заказе
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

  // Пока корзина поднимается из localStorage — не мигаем пустой формой.
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
            <DeliveryMethodCards
              value={deliveryMethod}
              subtotal={cartTotal}
              onChange={setDeliveryMethod}
            />
          </fieldset>

          {/* 2. Получатель */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              Получатель
            </legend>
            <p className="text-xs text-brand-500">
              Укажите ФИО полностью, без сокращений.
            </p>
            {fromProfile && (
              <p className="animate-fade-up-sm text-xs text-brand-600">
                Заполнено из{" "}
                <Link href="/account" className="font-semibold underline">
                  личного кабинета
                </Link>
                . Здесь можно поменять — на профиль это не повлияет.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Фамилия *
                </span>
                <input required value={form.last_name} onChange={update("last_name")} className="input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Имя *
                </span>
                <input required value={form.first_name} onChange={update("first_name")} className="input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Отчество
                </span>
                <input value={form.middle_name} onChange={update("middle_name")} className="input" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Телефон *
                </span>
                {/* Код страны нарисован в поле: вводить нужно только 10 цифр,
                    формат сайт расставит сам (см. components/phone-input). */}
                <PhoneInput
                  required
                  value={form.phone}
                  onChange={(v) => {
                    formTouched.current = true;
                    setForm((f) => ({ ...f, phone: v }));
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-brand-700">
                  Email *
                </span>
                {/* Обязателен: на него Robokassa отправляет фискальный чек
                    (54-ФЗ), а сайт — письма о заказе. */}
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  className="input"
                />
              </label>
            </div>
          </fieldset>

          {/* 3. Адрес — зависит от способа доставки */}
          <fieldset className="space-y-3">
            <legend className="text-base font-bold text-brand-800">
              {deliveryMethod === "ozon" ? "Пункт выдачи" : "Адрес доставки"}
            </legend>
            {deliveryMethod === "ozon" ? (
              <OzonPvzField
                value={pvz}
                onChange={setPvz}
                onRegionKladr={setPvzRegionKladr}
              />
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
            Доставка Ozon или Почтой России — {formatPrice(DELIVERY_COST)} по
            всей России; при заказе от {formatPrice(FREE_DELIVERY_FROM)} —
            бесплатно.
          </p>
          {error && (
            <p role="alert" className="alert-error">
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
              {deliveryCost === 0 ? (
                <span className="font-semibold text-brand-600">бесплатно</span>
              ) : (
                <span>{formatPrice(deliveryCost)}</span>
              )}
            </div>
            {discount > 0 && (
              <div className="flex justify-between font-semibold text-brand-600">
                <span>Промокод {promo?.code}</span>
                <span>−{formatPrice(discount)}</span>
              </div>
            )}
          </div>
          {promoNotice && (
            <p role="status" className="mt-3 rounded-xl bg-accent-500/10 px-3 py-2 text-xs text-accent-600">
              {promoNotice}
            </p>
          )}
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
              (deliveryMethod === "ozon" &&
                (!pvz.trim() || Boolean(ozonRestrictedRegion(pvz))))
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
