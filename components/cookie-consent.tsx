"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie_consent";

// Плашка о cookies: показывается, пока пользователь не нажал «Хорошо».
// Отметка о согласии хранится в localStorage и между сессиями не сбрасывается.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage недоступен (приватный режим) — плашку не показываем,
      // чтобы не мигать ею при каждой загрузке.
    }
  }, []);

  if (!visible) return null;

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // некуда сохранить — просто скрываем до следующей загрузки
    }
    setVisible(false);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
      role="region"
      aria-label="Сообщение об использовании cookies"
    >
      <div className="card mx-auto flex max-w-3xl animate-fade-up flex-col items-start gap-3 p-4 shadow-xl sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-brand-700">
          Мы используем cookies, чтобы работали вход в аккаунт и корзина.
          Оставаясь на сайте, вы соглашаетесь с{" "}
          <Link
            href="/privacy"
            className="font-semibold underline hover:text-brand-800"
          >
            политикой конфиденциальности
          </Link>
          .
        </p>
        <button type="button" onClick={accept} className="btn-primary shrink-0 !py-2">
          Хорошо
        </button>
      </div>
    </div>
  );
}
