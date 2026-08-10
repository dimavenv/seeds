"use client";

import { useEffect, useRef, useState } from "react";
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

  // Панель не размонтируется, а сворачивается — иначе анимировать закрытие
  // нечем (React убрал бы узел мгновенно). Но свёрнутая панель не должна
  // ловить фокус табом и читаться скринридером: за это отвечает inert. Ставим
  // его свойством через ref — как атрибут React 18 его не поддерживает.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open]);

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
        className="card group flex w-full items-center gap-4 p-4 text-left transition duration-200 hover:border-brand-300 hover:shadow-md sm:p-5"
      >
        {/* Шестерёнка — рисованная иконка, а не эмодзи: эмодзи в каждой системе
            своё, а повёрнутое (так было раньше при раскрытии) выглядит просто
            сломанным. Настоящая шестерёнка крутиться умеет — доворачиваем её на
            наведение, это подсказка «здесь настраивают». */}
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 transition-colors duration-200 group-hover:bg-brand-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 transition-transform duration-500 ease-out group-hover:rotate-90"
          >
            <path
              fillRule="evenodd"
              d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567l-.091.549a.798.798 0 01-.517.608 7.45 7.45 0 00-.478.198.798.798 0 01-.796-.064l-.453-.324a1.875 1.875 0 00-2.416.2l-.243.243a1.875 1.875 0 00-.2 2.416l.324.453a.798.798 0 01.064.796 7.448 7.448 0 00-.198.478.798.798 0 01-.608.517l-.55.092a1.875 1.875 0 00-1.566 1.849v.344c0 .917.663 1.699 1.567 1.85l.549.091c.281.047.508.25.608.517.06.162.127.322.198.478a.798.798 0 01-.064.796l-.324.453a1.875 1.875 0 00.2 2.416l.243.243c.648.648 1.67.733 2.416.2l.453-.324a.798.798 0 01.796-.064c.156.071.316.137.478.198.267.1.47.327.517.608l.092.55c.15.903.932 1.566 1.849 1.566h.344c.917 0 1.699-.663 1.85-1.567l.091-.549a.798.798 0 01.517-.608 7.473 7.473 0 00.478-.198.798.798 0 01.796.064l.453.324a1.875 1.875 0 002.416-.2l.243-.243c.648-.648.733-1.67.2-2.416l-.324-.453a.798.798 0 01-.064-.796c.071-.156.137-.316.198-.478.1-.267.327-.47.608-.517l.55-.091a1.875 1.875 0 001.566-1.85v-.344c0-.917-.663-1.699-1.567-1.85l-.549-.091a.798.798 0 01-.608-.517 7.462 7.462 0 00-.198-.478.798.798 0 01.064-.796l.324-.453a1.875 1.875 0 00-.2-2.416l-.243-.243a1.875 1.875 0 00-2.416-.2l-.453.324a.798.798 0 01-.796.064 7.453 7.453 0 00-.478-.198.798.798 0 01-.517-.608l-.091-.55a1.875 1.875 0 00-1.85-1.566h-.344zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
              clipRule="evenodd"
            />
          </svg>
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
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-5 w-5 shrink-0 text-brand-400 transition-transform duration-300 ease-out ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Плавное раскрытие без «прыжка»: анимируем grid-template-rows от 0fr к
          1fr. Высоту содержимого при этом знать не нужно — в отличие от
          max-height, где приходится задавать заведомо большое значение, и
          закрытие получается рывком. Внутренняя обёртка обрезает содержимое,
          пока строка сжата.
          Уважение к «уменьшить движение» настроено глобально в globals.css:
          там все переходы схлопываются до мгновенных. */}
      <div
        ref={panelRef}
        id="account-settings-panel"
        aria-hidden={!open}
        className={`grid transition-all duration-300 ease-out ${
          open ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
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

          {/* key — чтобы React пересоздал блок при смене вкладки: без этого
              анимация появления не проигрывается повторно. */}
          <div key={tab} className="animate-fade-up-sm">
            {tab === "profile" ? (
              <AccountProfileForm email={email} profile={profile} />
            ) : (
              <AccountPasswordForm generated={autoPassword} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
