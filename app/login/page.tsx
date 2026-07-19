"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPb } from "@/lib/pb/client";
import SmartCaptcha, { captchaEnabled } from "@/components/smart-captcha";

type Health = { ok: boolean; configured: boolean; ms?: number; error?: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  // Проверка доступности базы при загрузке страницы.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ ok: false, configured: true, error: "нет ответа" })
      );
  }, []);

  // Сброс одноразовой капчи после неудачной попытки входа.
  function resetCaptcha() {
    setCaptchaToken("");
    setCaptchaReset((n) => n + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !captchaToken) {
      setError("Подтвердите, что вы не робот");
      return;
    }
    setLoading(true);

    // Защита от вечного спиннера.
    const safety = setTimeout(() => {
      setError(
        "База данных не отвечает. Проверьте, запущен ли PocketBase на сервере (/api/health)."
      );
      setLoading(false);
    }, 10000);

    try {
      // Сначала проверяем капчу на сервере, затем входим.
      if (captchaEnabled) {
        const guard = await fetch("/api/login-guard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ captchaToken }),
        });
        if (!guard.ok) {
          clearTimeout(safety);
          const data = await guard.json().catch(() => ({}));
          setError(data.error ?? "Подтвердите, что вы не робот");
          setLoading(false);
          resetCaptcha();
          return;
        }
      }

      const pb = getPb();
      await pb.collection("users").authWithPassword(email, password);
      clearTimeout(safety);
      // Жёсткий переход — надёжнее обновляет сессию.
      window.location.assign("/account");
    } catch (e) {
      clearTimeout(safety);
      const status = (e as { status?: number })?.status;
      setError(
        status === 400
          ? "Неверный email или пароль"
          : "Не удалось подключиться к базе. Проверьте /api/health и настройки PocketBase."
      );
      setLoading(false);
      resetCaptcha();
    }
  }

  const dbDown = health && !health.ok;

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Вход</h1>
        <p className="mt-1 text-sm text-brand-500">
          Войдите в личный кабинет или панель администратора.
        </p>

        {dbDown && (
          <div className="mt-4 rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-700">
            <strong>База данных недоступна.</strong>
            <div className="mt-1">
              {!health?.configured
                ? "Не задан NEXT_PUBLIC_PB_URL в .env.production."
                : "Запрос к PocketBase не прошёл. Проверьте, что сервис запущен (systemctl status pocketbase) и адрес в .env.production верный."}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Пароль</span>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>
          <SmartCaptcha onToken={setCaptchaToken} resetSignal={captchaReset} />

          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || (captchaEnabled && !captchaToken)}
            className="btn-primary w-full"
          >
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-brand-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-800">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
