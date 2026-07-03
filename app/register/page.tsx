"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        window.location.assign("/account");
      } else {
        setMessage("Проверьте почту для подтверждения регистрации.");
        setLoading(false);
      }
    } catch {
      setError("Supabase не настроен. Укажите ключи в .env.local");
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-brand-800">Регистрация</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Имя</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Пароль</span>
            <input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>
          {error && (
            <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">{error}</p>
          )}
          {message && (
            <p className="rounded-xl bg-brand-100 px-4 py-2 text-sm text-brand-700">{message}</p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Создаём…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-brand-400">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
