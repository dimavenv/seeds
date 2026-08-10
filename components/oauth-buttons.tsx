"use client";

import { useEffect, useState } from "react";

// Кнопки входа через внешний сервис (Яндекс ID).
//
// Список провайдеров спрашиваем у сервера: включение живёт в настройках
// PocketBase, и пока там ничего не настроено — блок просто не появляется, а
// вход по паролю работает как работал. Сама кнопка — обычная ссылка: дальше
// всё делает сервер (см. /api/auth/oauth/start), в JS не попадает ни токен, ни
// ключи приложения.
type Provider = { name: string; title: string };

// Фирменные цвета — по ним кнопку узнают раньше, чем прочитают подпись.
const BRAND: Record<string, string> = {
  yandex: "bg-[#fc3f1d] hover:bg-[#e5381a] text-white",
  vk: "bg-[#0077ff] hover:bg-[#0066dd] text-white",
};

// Значок сервиса. Логотипы рисуем буквой, а не картинкой: правила
// использования фирменных знаков у обоих сервисов строгие, а буква в
// фирменном цвете ничего не нарушает и не тянет лишний файл.
const MARK: Record<string, string> = {
  yandex: "Я",
  vk: "VK",
};

export default function OAuthButtons({ action }: { action: "login" | "register" }) {
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/oauth/providers")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d?.providers)) setProviders(d.providers);
      })
      .catch(() => {
        // не ответил — просто не показываем кнопки
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (providers.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Разделитель «или» — чтобы кнопка не читалась как часть формы выше. */}
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-brand-400">
        <span className="h-px flex-1 bg-brand-100" />
        или
        <span className="h-px flex-1 bg-brand-100" />
      </div>

      <div className="mt-4 space-y-2">
        {providers.map((p) => (
          <a
            key={p.name}
            href={`/api/auth/oauth/start?provider=${encodeURIComponent(p.name)}`}
            className={`btn w-full transition-transform active:scale-[0.98] ${
              BRAND[p.name] ?? "btn-outline"
            }`}
          >
            {MARK[p.name] && (
              <span aria-hidden="true" className="text-base font-black leading-none">
                {MARK[p.name]}
              </span>
            )}
            {action === "login" ? "Войти" : "Продолжить"} через {p.title}
          </a>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-brand-400">
        Пароль придумывать не нужно: почту и имя возьмём из выбранного сервиса.
      </p>
    </div>
  );
}
