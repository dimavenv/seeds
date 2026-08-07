"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/account/actions";
import { formatPhone, type Profile } from "@/lib/profile";

// Данные покупателя в личном кабинете. Заполняются один раз — дальше сайт сам
// подставляет их в оформление заказа вместе с почтой аккаунта (изменить там
// можно, на профиль это не влияет).
export default function AccountProfileForm({
  email,
  profile,
}: {
  email: string | null;
  profile: Profile;
}) {
  const [form, setForm] = useState<Profile>(profile);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function update(field: keyof Profile) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setSaved(false);
      setError(null);
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await updateProfile(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-lg font-bold text-brand-800">Мои данные</h2>
      <p className="mt-1 text-sm text-brand-500">
        Подставим их в оформление заказа вместе с почтой — заполнять форму
        каждый раз не придётся. В самом заказе данные можно поменять.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Фамилия
          </span>
          <input
            value={form.last_name}
            onChange={update("last_name")}
            className="input"
            autoComplete="family-name"
            placeholder="Иванов"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Имя
          </span>
          <input
            value={form.first_name}
            onChange={update("first_name")}
            className="input"
            autoComplete="given-name"
            placeholder="Иван"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Отчество
          </span>
          <input
            value={form.middle_name}
            onChange={update("middle_name")}
            className="input"
            autoComplete="additional-name"
            placeholder="Иванович"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Телефон
          </span>
          <input
            type="tel"
            value={form.phone}
            onChange={update("phone")}
            // Приводим к единому виду, когда покупатель уходит из поля: в базе
            // всё равно окажется +7XXXXXXXXXX.
            onBlur={() => setForm((f) => ({ ...f, phone: formatPhone(f.phone) }))}
            className="input"
            autoComplete="tel"
            placeholder="+7 999 123-45-67"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Email
          </span>
          {/* Почта — логин от аккаунта, здесь только для сведения. */}
          <input
            value={email ?? ""}
            readOnly
            disabled
            className="input opacity-70"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="alert-error mt-4">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
        {saved && !pending && (
          <span role="status" className="text-sm font-semibold text-brand-600">
            Сохранено
          </span>
        )}
      </div>
    </form>
  );
}
