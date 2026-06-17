"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Защита от вечного спиннера: если за 12с ничего не произошло — сброс.
    const safety = setTimeout(() => {
      setError(
        "Сервер Supabase не отвечает. Проверьте NEXT_PUBLIC_SUPABASE_URL и ключи в .env.local."
      );
      setLoading(false);
    }, 12000);

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
      // Жёсткий переход (а не router.push) — надёжнее обновляет сессию.
      window.location.assign("/account");
    } catch {
      clearTimeout(safety);
      setError(
        "Не удалось подключиться к Supabase. Проверьте ключи в .env.local."
      );
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Вход</h1>
        <p className="mt-1 text-sm text-brand-500">
          Войдите в личный кабинет или панель администратора.
        </p>
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
