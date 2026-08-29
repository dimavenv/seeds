"use client";

import { useRef, useState } from "react";
import ConsentCheckbox from "@/components/consent-checkbox";
import SmartCaptcha, {
  captchaEnabled,
  type SmartCaptchaHandle,
} from "@/components/smart-captcha";
import { GOALS, reachGoal } from "@/lib/metrika";

export default function SupportForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [consent, setConsent] = useState(false);
  const captchaRef = useRef<SmartCaptchaHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function send(captchaToken: string) {
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, captchaToken, consent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить заявку");
        setSubmitting(false);
        captchaRef.current?.reset();
        return;
      }
      reachGoal(GOALS.supportRequest, { subject: form.subject });
      setDone(true);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setSubmitting(false);
      captchaRef.current?.reset();
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Подтвердите согласие на обработку персональных данных");
      return;
    }
    setSubmitting(true);
    if (captchaEnabled) captchaRef.current?.execute();
    else void send("");
  }

  function captchaError(message: string) {
    setError(message);
    setSubmitting(false);
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
          <input required value={form.name} onChange={update("name")} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Email для ответа *
          </span>
          <input required type="email" value={form.email} onChange={update("email")} className="input" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Тема *
        </span>
        <input required value={form.subject} onChange={update("subject")} className="input" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Вопрос *
        </span>
        <textarea required value={form.message} onChange={update("message")} className="input min-h-32" />
      </label>
      <ConsentCheckbox checked={consent} onChange={setConsent} />
      <SmartCaptcha
        ref={captchaRef}
        onToken={(token) => void send(token)}
        onError={captchaError}
      />
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !consent}
        className="btn-accent w-full sm:w-auto"
      >
        {submitting ? "Отправляем…" : "Отправить вопрос"}
      </button>
    </form>
  );
}
