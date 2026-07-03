"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Health = { ok: boolean; configured: boolean; ms?: number; error?: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  // Проверка доступности базы при загрузке страницы.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ ok: false, configured: true, error: "нет ответа" })
      );
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Защита от вечного спиннера.
    const safety = setTimeout(() => {
      setError(
        "Сервер Supabase не отвечает. Скорее всего проект на паузе — откройте дашборд Supabase и нажмите Restore."
      );
      setLoading(false);
    }, 10000);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      clearTimeout(safety);
      if (error) {
        setError("Неверный email или пароль");
        setLoading(false);
        return;
      }
      // Жёсткий переход — надёжнее обновляет сессию.
      window.location.assign("/account");
    } catch {
      clearTimeout(safety);
      setError(
        "Не удалось подключиться к базе. Проверьте, не на паузе ли проект Supabase, и ключи в .env.local."
      );
      setLoading(false);
    }
  }

  const dbDown = health && !health.ok;

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Вход</h1>
        <p className="mt-1 text-sm text-brand-400">
          Войдите в личный кабинет или панель администратора.
        </p>

        {dbDown && (
          <div className="mt-4 rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-700">
            <strong>База данных недоступна.</strong>
            <div className="mt-1">
              {!health?.configured
                ? "Не заданы ключи Supabase в .env.local."
                : "Запрос к Supabase не прошёл. Чаще всего это значит, что проект на бесплатном тарифе поставлен на паузу — откройте дашборд Supabase и нажмите Restore. Также сверьте URL и ключи в .env.local."}
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
          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-brand-400">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-800">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
