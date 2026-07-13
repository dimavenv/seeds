"use client";

import { useState } from "react";
import Link from "next/link";
import { getPb } from "@/lib/pb/client";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !captchaToken) {
      setError("Подтвердите, что вы не робот");
      return;
    }
    setLoading(true);

    try {
      // Создание аккаунта — на сервере (проверка российской почты и капчи).
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
      // Успех — сразу входим и переходим в кабинет.
      await getPb().collection("users").authWithPassword(email, password);
      window.location.assign("/account");
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Регистрация</h1>
        <p className="mt-1 text-sm text-brand-500">
          Регистрация доступна с российской почты (Яндекс, Mail.ru, Rambler,
          домены .ru / .рф).
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
            <span className="mb-1 block text-sm font-semibold text-brand-700">Пароль</span>
            <input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>

          <SmartCaptcha onToken={setCaptchaToken} />

          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">{error}</p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Создаём…" : "Зарегистрироваться"}
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
