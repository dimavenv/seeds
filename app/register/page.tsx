"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { serverLogin } from "@/lib/pb/client";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Шаг «код из письма»: билет с сервера + введённый код + пауза до повтора.
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function finishLogin() {
    // Аккаунт создан — входим через сервер (ставит httpOnly-cookie) и идём в
    // кабинет. Если включена капча, авто-вход без токена не пройдёт — тогда
    // просто отправляем на страницу входа с пометкой об успешной регистрации.
    const result = await serverLogin({ email, password });
    if (result.ok) {
      window.location.assign("/account");
    } else {
      window.location.assign("/login?registered=1");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !captchaToken) {
      setError("Подтвердите, что вы не робот");
      return;
    }
    setLoading(true);

    try {
      // Шаг 1 — на сервере: проверка почты и капчи, отправка кода.
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: fullName.trim(),
          captchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось зарегистрироваться");
        setLoading(false);
        return;
      }
      if (data.needCode && data.ticket) {
        // Почта настроена — ждём код из письма.
        setTicket(data.ticket);
        setResendIn(45);
        setLoading(false);
        return;
      }
      // Почта не настроена на сервере — аккаунт создан сразу.
      await finishLogin();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket,
          code: code.trim(),
          password,
          name: fullName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось подтвердить код");
        setLoading(false);
        return;
      }
      await finishLogin();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await fetch("/api/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, name: fullName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить письмо");
        return;
      }
      setTicket(data.ticket);
      setResendIn(45);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
  }

  // Шаг 2: ввод кода из письма.
  if (ticket) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-md p-8">
          <h1 className="text-2xl font-bold text-brand-800">Подтвердите почту</h1>
          <p className="mt-1 text-sm text-brand-500">
            Мы отправили 6-значный код на <b>{email}</b>. Введите его, чтобы
            завершить регистрацию. Письмо не пришло — проверьте «Спам».
          </p>
          <form onSubmit={confirm} className="mt-6 space-y-4">
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
            {error && (
              <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">{error}</p>
            )}
            <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full">
              {loading ? "Проверяем…" : "Подтвердить и создать аккаунт"}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={resend}
              disabled={resendIn > 0}
              className="font-semibold text-brand-600 hover:text-brand-800 disabled:cursor-default disabled:text-brand-400"
            >
              {resendIn > 0 ? `Отправить ещё раз (${resendIn} с)` : "Отправить код ещё раз"}
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

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Регистрация</h1>
        <p className="mt-1 text-sm text-brand-500">
          Регистрация доступна с российской почты (Яндекс, Mail.ru, Rambler,
          домены .ru / .рф). На неё придёт код подтверждения.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Имя</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@yandex.ru" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">
              Пароль <span className="font-normal text-brand-400">(минимум 8 символов)</span>
            </span>
            <input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>

          <SmartCaptcha onToken={setCaptchaToken} />

          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">{error}</p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Отправляем код…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-brand-500">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-800">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
