"use client";

import { useState } from "react";
import { getPb } from "@/lib/pb/client";
import SettingsCard from "@/components/settings-card";
import { Field } from "@/components/account-profile-form";

// Смена пароля. Проверку старого пароля и перевыпуск сессии делает сервер
// (см. /api/account/password) — здесь только форма и понятные ответы.
export default function AccountPasswordForm({ generated }: { generated: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (next !== repeat) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        record?: unknown;
        reauth?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Не удалось сменить пароль");
        setLoading(false);
        return;
      }
      // Смена пароля гасит все прежние токены. Серверную cookie роут уже
      // перевыпустил; клиентскому SDK (корзина, избранное) отдаём новый токен,
      // иначе его запросы пошли бы со старым.
      if (data.token) getPb().authStore.save(data.token, data.record as never);
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(
        data.reauth
          ? "Пароль изменён. Войдите заново с новым паролем."
          : "Пароль изменён. На других устройствах нужно будет войти заново."
      );
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    }
    setLoading(false);
  }

  return (
    <SettingsCard
      icon="🔒"
      title="Безопасность"
      hint={
        generated
          ? "Пароль сейчас тот, что мы прислали письмом после оплаты. Заменить его на свой — хорошая идея."
          : "Пароль от кабинета. Меняйте его, если он мог кому-то попасться на глаза."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Текущий пароль">
          <input
            required
            type={show ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input"
            autoComplete="current-password"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Новый пароль" hint="минимум 8 символов">
            <input
              required
              minLength={8}
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Ещё раз">
            <input
              required
              minLength={8}
              type={show ? "text" : "password"}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-600">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Показать пароли
        </label>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="rounded-xl bg-brand-100 px-4 py-2 text-sm text-brand-700">
            {done}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !current || next.length < 8}
          className="btn-primary"
        >
          {loading ? "Меняем…" : "Сменить пароль"}
        </button>
      </form>
    </SettingsCard>
  );
}
