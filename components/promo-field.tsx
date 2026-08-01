"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store-provider";
import { formatPrice } from "@/lib/format";
import { PROMO_CODE_MAX_LENGTH, parsePromoRule } from "@/lib/promo";
import { GOALS, reachGoal } from "@/lib/metrika";
import { CheckIcon, CloseIcon } from "@/components/icons";
import Spinner from "@/components/spinner";

// Поле промокода в корзине: сначала — скромная ссылка «У меня есть промокод»,
// по клику она превращается в поле ввода (как и просили), а после успешной
// проверки — в зелёную плашку с кодом и размером скидки.
//
// Проверяет код СЕРВЕР (POST /api/promo): здесь ни списка кодов, ни правил
// скидки нет. Гостю сервер отвечает «войдите в аккаунт» — эту подсказку и
// показываем, со ссылками на вход и регистрацию.

type ApplyState = { error: string | null; needAuth: boolean };

export default function PromoField() {
  const { promo, discount, applyPromo, clearPromo, cartTotal } = useStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ApplyState>({ error: null, needAuth: false });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Открыли поле — сразу ставим курсор в него.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setState({ error: null, needAuth: false });
    if (!code.trim()) {
      setState({ error: "Введите промокод", needAuth: false });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        promo?: unknown;
        error?: string;
        needAuth?: boolean;
      };
      if (!res.ok || !data.ok) {
        setState({
          error: data.error ?? "Не удалось применить промокод",
          needAuth: Boolean(data.needAuth),
        });
        return;
      }
      // Показываем ровно то, что вернул сервер (канонический код и скидку), а
      // не то, что ввёл покупатель.
      const rule = parsePromoRule(data.promo);
      if (!rule) {
        setState({ error: "Не удалось применить промокод", needAuth: false });
        return;
      }
      applyPromo(rule);
      reachGoal(GOALS.promoApplied, { code: rule.code });
      setCode("");
      setOpen(false);
    } catch {
      setState({ error: "Сеть недоступна — попробуйте ещё раз", needAuth: false });
    } finally {
      setBusy(false);
    }
  }

  // Код применён.
  if (promo) {
    // Сумма упала ниже порога промокода — честно предупреждаем, что скидки
    // сейчас нет (сервер посчитает так же).
    const belowMin = discount === 0 && cartTotal < promo.minSubtotal;
    return (
      <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2.5">
        {/* Код и размер скидки — в две строки: в узкой колонке «Итого» одна
            строка обрезалась бы многоточием ровно на самом важном. */}
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-start gap-2 text-sm text-brand-700">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0">
              <span className="block font-semibold">Промокод {promo.code}</span>
              {promo.label && (
                <span className="block text-xs text-brand-600">{promo.label}</span>
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={clearPromo}
            className="shrink-0 rounded-full p-1 text-brand-400 transition hover:text-accent-600"
            aria-label="Убрать промокод"
            title="Убрать промокод"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {belowMin && (
          <p className="mt-1.5 text-xs text-accent-600">
            Скидка начнёт действовать при сумме товаров от{" "}
            {formatPrice(promo.minSubtotal)}.
          </p>
        )}
      </div>
    );
  }

  // Свёрнутое состояние — та самая надпись, по клику превращается в поле.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
      >
        У меня есть промокод
      </button>
    );
  }

  return (
    <form onSubmit={apply} className="mt-3">
      <label htmlFor="promo-code" className="mb-1 block text-sm font-semibold text-brand-700">
        Промокод
      </label>
      <div className="flex gap-2">
        <input
          id="promo-code"
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={PROMO_CODE_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Введите код"
          className="input uppercase"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "promo-error" : undefined}
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {busy ? <Spinner className="h-4 w-4" /> : "Применить"}
        </button>
      </div>
      {state.error && (
        <p id="promo-error" role="alert" className="alert-error mt-2">
          {state.error}
          {state.needAuth && (
            <>
              {" "}
              <Link href="/login" className="font-semibold underline">
                Войти
              </Link>{" "}
              ·{" "}
              <Link href="/register" className="font-semibold underline">
                Зарегистрироваться
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
