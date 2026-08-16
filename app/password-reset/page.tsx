"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";

// Сброс пароля в два шага, как и подтверждение почты при регистрации:
// 1) почта + капча → на неё уходит 6-значный код, клиент получает «билет»;
// 2) код + новый пароль → сервер меняет пароль по почте ИЗ БИЛЕТА.
//
// Ответ первого шага одинаков для существующей и несуществующей почты, поэтому
// текст на экране написан так, чтобы не выдавать, есть ли аккаунт.
export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [codeLeft, setCodeLeft] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (codeLeft <= 0) return;
    const t = setTimeout(() => setCodeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [codeLeft]);

  // Запрос кода — он же повторная отправка (сервер сохраняет прежние коды).
  async function requestCode(again = false) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          captchaToken,
          ...(again && ticket ? { ticket } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить код");
        setCaptchaToken("");
        setCaptchaReset((n) => n + 1);
        setLoading(false);
        return;
      }
      setTicket(data.ticket);
      setResendIn(45);
      setCodeLeft(Number(data.expiresIn) || 0);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
    setLoading(false);
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, code: code.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сменить пароль");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
    setLoading(false);
  }

  // ===== Готово =====
  if (done) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-md p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl">
            ✅
          </div>
          <h1 className="mt-5 text-2xl font-bold text-brand-800">
            Пароль изменён
          </h1>
          <p className="mt-2 text-brand-600">
            Теперь войдите с новым паролем. Мы отправили письмо о смене — на
            случай, если это были не вы.
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full">
            Войти
          </Link>
        </div>
      </div>
    );
  }

  // ===== Шаг 2: код и новый пароль =====
  if (ticket) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-brand-800">Новый пароль</h1>
          <p className="mt-1 text-sm text-brand-500">
            Если аккаунт с адресом <b>{email.trim()}</b> существует, на него
            ушёл 6-значный код. Письмо не пришло — проверьте «Спам»; Mail.ru
            иногда придерживает первое письмо на пару минут.
          </p>
          {codeLeft > 0 ? (
            <p className="mt-2 text-sm text-brand-600">
              Код действует ещё{" "}
              <b>
                {Math.floor(codeLeft / 60)}:
                {String(codeLeft % 60).padStart(2, "0")}
              </b>
            </p>
          ) : (
            <p className="mt-2 text-sm text-accent-600">
              Срок кода истёк — запросите новый.
            </p>
          )}

          <form onSubmit={submitNewPassword} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-700">
                Код из письма
              </span>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="input text-center text-2xl tracking-[0.5em]"
                placeholder="••••••"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-700">
                Новый пароль{" "}
                <span className="font-normal text-brand-400">
                  (минимум 8 символов)
                </span>
              </span>
              <input
                required
                minLength={8}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-600">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              Показать пароль
            </label>

            {error && (
              <p role="alert" className="alert-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || code.length !== 6 || password.length < 8}
              className="btn-primary w-full"
            >
              {loading ? "Меняем…" : "Сменить пароль"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => requestCode(true)}
              disabled={resendIn > 0 || loading}
              className="font-semibold text-brand-600 hover:text-brand-800 disabled:cursor-default disabled:text-brand-400"
            >
              {resendIn > 0
                ? `Отправить ещё раз (${resendIn} с)`
                : "Отправить код ещё раз"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTicket(null);
                setCode("");
                setError(null);
              }}
              className="text-brand-500 hover:text-brand-700"
            >
              Изменить почту
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Шаг 1: почта =====
  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-800">Забыли пароль?</h1>
        <p className="mt-1 text-sm text-brand-500">
          Укажите почту, на которую зарегистрирован аккаунт, — пришлём код для
          смены пароля.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (captchaEnabled && !captchaToken) {
              setError("Подтвердите, что вы не робот");
              return;
            }
            void requestCode();
          }}
          className="mt-6 space-y-4"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Email
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              autoComplete="email"
            />
          </label>

          <SmartCaptcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          {error && (
            <p role="alert" className="alert-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Отправляем код…" : "Прислать код"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-brand-500">
          Вспомнили пароль?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:text-brand-800"
          >
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
