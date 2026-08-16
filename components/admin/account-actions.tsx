"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUser, setUserBlocked } from "@/app/admin/actions";

// Блокировка и удаление аккаунта.
//
// Оба действия задевают живого человека, поэтому оба спрашивают подтверждение,
// а блокировка — ещё и причину: её покупатель увидит на экране «аккаунт
// заблокирован» вместо глухого «доступ закрыт».
export default function AccountActions({
  id,
  email,
  blocked,
  reason,
  disabled,
  disabledHint,
}: {
  id: string;
  email: string;
  blocked: boolean;
  reason: string | null;
  // Свой аккаунт и аккаунт другого админа трогать нельзя — сервер это тоже
  // проверяет, но кнопки лучше не показывать вовсе.
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [asking, setAsking] = useState<null | "block" | "delete">(null);
  const [text, setText] = useState(reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok?: boolean; error?: string }>, done?: () => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (res?.error) {
        setError(res.error);
        return;
      }
      setAsking(null);
      if (done) done();
      else router.refresh();
    });
  }

  if (disabled) {
    return (
      <p className="text-sm text-brand-500">
        {disabledHint ?? "Этот аккаунт защищён от изменений."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      {/* ===== Разблокировать ===== */}
      {blocked && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setUserBlocked(id, false))}
          className="btn-primary w-full"
        >
          {pending ? "Снимаем…" : "🔓 Снять блокировку"}
        </button>
      )}

      {/* ===== Заблокировать ===== */}
      {!blocked &&
        (asking === "block" ? (
          <div className="animate-fade-up-sm rounded-xl border border-accent-500/30 bg-accent-500/5 p-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-700">
                Причина <span className="font-normal text-brand-400">(увидит покупатель)</span>
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                className="input min-h-20"
              />
            </label>
            <p className="mt-2 text-xs text-brand-500">
              Покупатель потеряет доступ к кабинету и не сможет оформлять
              заказы. Данные и история сохранятся.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setUserBlocked(id, true, text))}
                className="btn bg-accent-500 text-white hover:bg-accent-600"
              >
                {pending ? "Блокируем…" : "Заблокировать"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setAsking(null)}
                className="text-sm text-brand-500 hover:text-brand-700"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAsking("block")}
            className="btn-outline w-full"
          >
            🔒 Заблокировать
          </button>
        ))}

      {/* ===== Удалить ===== */}
      {asking === "delete" ? (
        <div className="animate-fade-up-sm rounded-xl border border-accent-500/30 bg-accent-500/5 p-4">
          <p className="text-sm text-brand-700">
            Удалить аккаунт <b className="break-all">{email}</b>? Это
            необратимо.
          </p>
          <p className="mt-2 text-xs text-brand-500">
            Заказы этого покупателя останутся в базе и в отчётах — они просто
            перестанут быть привязаны к аккаунту. Пропадут корзина с избранным
            и отметки об использованных промокодах.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteUser(id),
                  () => router.push("/admin/accounts")
                )
              }
              className="btn bg-accent-500 text-white hover:bg-accent-600"
            >
              {pending ? "Удаляем…" : "Да, удалить"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setAsking(null)}
              className="text-sm text-brand-500 hover:text-brand-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking("delete")}
          className="w-full text-sm font-semibold text-accent-600 hover:underline"
        >
          Удалить аккаунт
        </button>
      )}
    </div>
  );
}
