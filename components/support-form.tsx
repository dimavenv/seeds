"use client";

import { useState } from "react";
import ConsentCheckbox from "@/components/consent-checkbox";

export default function SupportForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Подтвердите согласие на обработку персональных данных");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить заявку");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl bg-brand-50 p-6 text-center">
        <div className="text-3xl">✅</div>
        <p className="mt-3 font-semibold text-brand-800">
          Заявка отправлена!
        </p>
        <p className="mt-1 text-sm text-brand-600">
          Мы ответим на указанную почту <strong>{form.email}</strong>. Обработка
          ручная и может занять время.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Имя *
          </span>
          <input required value={form.name} onChange={update("name")} className="input" placeholder="Как к вам обращаться" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Email для ответа *
          </span>
          <input required type="email" value={form.email} onChange={update("email")} className="input" placeholder="you@example.com" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Тема *
        </span>
        <input required value={form.subject} onChange={update("subject")} className="input" placeholder="Кратко о чём вопрос" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Вопрос *
        </span>
        <textarea required value={form.message} onChange={update("message")} className="input min-h-32" placeholder="Опишите ваш вопрос подробнее" />
      </label>
      <ConsentCheckbox checked={consent} onChange={setConsent} />
      {error && (
        <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting || !consent} className="btn-accent w-full sm:w-auto">
        {submitting ? "Отправляем…" : "Отправить вопрос"}
      </button>
    </form>
  );
}
