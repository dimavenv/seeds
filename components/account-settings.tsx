"use client";

import { useState } from "react";
import AccountProfileForm from "@/components/account-profile-form";
import AccountPasswordForm from "@/components/account-password-form";
import type { Profile } from "@/lib/profile";

// Настройки кабинета за одной кнопкой.
//
// Раньше обе формы висели на странице всегда и оттесняли вниз то, ради чего в
// кабинет заходят, — заказы. Теперь это одна широкая кнопка-строка: нажал —
// раскрылась панель с переключателем «Мои данные | Безопасность» и нужной
// формой. Пароль, присланный сайтом после оплаты, помечается точкой на кнопке:
// подсказка заметна, но ничего не загораживает.
type Tab = "profile" | "security";

export default function AccountSettings({
  email,
  profile,
  autoPassword,
}: {
  email: string | null;
  profile: Profile;
  autoPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  // С присланным паролем логичнее открывать сразу «Безопасность».
  const [tab, setTab] = useState<Tab>(autoPassword ? "security" : "profile");

  const tabClass = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${
      on
        ? "bg-surface text-brand-800 shadow-sm"
        : "text-brand-500 hover:text-brand-700"
    }`;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="account-settings-panel"
        className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand-300 hover:shadow-md sm:p-5"
      >
        <span
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl transition ${
            open ? "rotate-90" : ""
          }`}
        >
          ⚙️
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-brand-800">Настройки аккаунта</span>
            {autoPassword && !open && (
              <span className="badge bg-accent-500/15 text-accent-700">
                ● Смените пароль
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-brand-500">
            ФИО, телефон и пароль — подставим их в оформление заказа
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-brand-400 transition ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div id="account-settings-panel" className="mt-3">
          <div className="mb-3 inline-flex gap-1 rounded-full bg-brand-100 p-1">
            <button
              type="button"
              onClick={() => setTab("profile")}
              className={tabClass(tab === "profile")}
            >
              Мои данные
            </button>
            <button
              type="button"
              onClick={() => setTab("security")}
              className={tabClass(tab === "security")}
            >
              Безопасность
            </button>
          </div>

          {tab === "profile" ? (
            <AccountProfileForm email={email} profile={profile} />
          ) : (
            <AccountPasswordForm generated={autoPassword} />
          )}
        </div>
      )}
    </div>
  );
}
