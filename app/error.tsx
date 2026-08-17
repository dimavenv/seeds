"use client";

import { useEffect } from "react";
import Link from "next/link";

// Что видит покупатель, если страница упала.
//
// Без этого файла Next показывает системную заглушку: в разработке — стек, а
// на проде голое «Application error: a client-side exception has occurred».
// Для магазина это выглядит как сломанный сайт, и человек просто уходит —
// хотя чаще всего достаточно повторить попытку (отвалившийся запрос к базе,
// потерянная сеть на телефоне).
//
// Границ ошибок в App Router две: эта ловит сбои внутри страниц, а
// app/global-error.tsx — сбой самого корневого layout. Ошибку notFound()
// границы НЕ ловят: для неё есть app/not-found.tsx, и код ответа 404
// сохраняется.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В браузере — в консоль; на сервере такие сбои уже попали в pm2-логи.
    // digest — короткий идентификатор, по которому серверную запись можно
    // найти в логе: покупатель может назвать его в обращении в поддержку.
    console.error("[error]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="bg-brand-50">
      <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-5xl shadow-sm">
          🌧️
        </div>

        <h1 className="mt-6 max-w-xl text-2xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-3xl">
          Что-то пошло не так
        </h1>
        <p className="mt-3 max-w-md text-brand-600">
          Страница не загрузилась — обычно это временный сбой связи. Попробуйте
          ещё раз: корзина и заказы на месте, ничего не потерялось.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            Попробовать ещё раз
          </button>
          <Link href="/" className="btn-outline">
            На главную
          </Link>
          <Link href="/support" className="btn-outline">
            Написать нам
          </Link>
        </div>

        {error.digest && (
          <p className="mt-8 text-xs text-brand-400">
            Код ошибки: {error.digest} — назовите его, если будете писать в
            поддержку.
          </p>
        )}
      </div>
    </div>
  );
}
