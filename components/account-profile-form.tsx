"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/account/actions";
import { type Profile } from "@/lib/profile";
import PhoneInput from "@/components/phone-input";
import SettingsCard from "@/components/settings-card";

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

  const dirty =
    form.last_name !== profile.last_name ||
    form.first_name !== profile.first_name ||
    form.middle_name !== profile.middle_name ||
    form.phone !== profile.phone;

  function set(field: keyof Profile, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
    setError(null);
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
    <SettingsCard
      icon="👤"
      title="Мои данные"
      hint="Подставим их в оформление заказа вместе с почтой — заполнять форму каждый раз не придётся. В самом заказе данные можно поменять."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Фамилия">
            <input
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              className="input"
              autoComplete="family-name"
            />
          </Field>
          <Field label="Имя">
            <input
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              className="input"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Отчество">
            <input
              value={form.middle_name}
              onChange={(e) => set("middle_name", e.target.value)}
              className="input"
              autoComplete="additional-name"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон">
            <PhoneInput
              value={form.phone}
              onChange={(v) => set("phone", v)}
              autoComplete="tel"
            />
          </Field>
          <Field label="Email" hint="логин от аккаунта">
            <input value={email ?? ""} readOnly disabled className="input opacity-60" />
          </Field>
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="btn-primary"
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </button>
          {saved && !pending && (
            <span
              role="status"
              className="animate-pop-in badge bg-brand-100 text-brand-700"
            >
              ✓ Сохранено
            </span>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-brand-700">{label}</span>
        {hint && <span className="text-xs text-brand-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
