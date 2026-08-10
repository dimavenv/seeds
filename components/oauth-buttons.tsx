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

const BRAND: Record<string, string> = {
  // Фирменный красный Яндекса — по нему кнопку узнают без подписи.
  yandex: "bg-[#fc3f1d] hover:bg-[#e5381a] text-white",
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
            className={`btn w-full ${BRAND[p.name] ?? "btn-outline"}`}
          >
            {p.name === "yandex" && (
              <span
                aria-hidden="true"
                className="text-lg font-black leading-none"
              >
                Я
              </span>
            )}
            {action === "login" ? "Войти" : "Продолжить"} через {p.title}
          </a>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-brand-400">
        Пароль придумывать не нужно: почту и имя возьмём из {providers[0].title}.
      </p>
    </div>
  );
}
