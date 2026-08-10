import Link from "next/link";
import LogoutButton from "@/components/logout-button";

// Экран заблокированного аккаунта.
//
// Показывается вместо кабинета. Задача — не напугать, а объяснить: что
// произошло, что стало недоступно, что при этом НЕ пропало и куда писать.
// Поэтому здесь и причина (если продавец её указал), и прямая ссылка в
// поддержку, и напоминание, что покупки остались возможны.
export default function BlockedAccount({
  email,
  reason,
}: {
  email: string | null;
  reason: string | null;
}) {
  return (
    <div className="container-page py-16">
      <div className="card animate-fade-up mx-auto max-w-lg overflow-hidden p-0 text-center">
        {/* Шапка с замком — единственное «громкое» место экрана. */}
        <div className="bg-accent-500/10 px-6 py-10">
          <span
            aria-hidden="true"
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-500/15 text-accent-600"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10">
              <path
                fillRule="evenodd"
                d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5zM12 14.25a1.5 1.5 0 00-.75 2.8v1.7a.75.75 0 001.5 0v-1.7a1.5 1.5 0 00-.75-2.8z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-bold text-brand-800 sm:text-3xl">
            Аккаунт заблокирован
          </h1>
          {email && (
            <p className="mt-2 break-all text-sm text-brand-500">{email}</p>
          )}
        </div>

        <div className="px-6 py-8 sm:px-10">
          {reason ? (
            <div className="rounded-xl bg-brand-100 px-4 py-3 text-left text-sm text-brand-700">
              <span className="font-semibold">Причина: </span>
              {reason}
            </div>
          ) : (
            <p className="text-brand-600">
              Доступ к личному кабинету закрыт магазином.
            </p>
          )}

          <p className="mt-4 text-sm text-brand-600">
            История заказов, избранное и сохранённые данные никуда не делись —
            они снова появятся, если блокировку снимут. Оформить новый заказ из
            этого аккаунта сейчас нельзя.
          </p>
          <p className="mt-2 text-sm text-brand-500">
            Считаете, что произошла ошибка? Напишите нам — разберёмся.
          </p>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/support" className="btn-primary">
              Написать в поддержку
            </Link>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
