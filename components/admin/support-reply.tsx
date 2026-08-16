"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replySupportRequest } from "@/app/admin/actions";
import { formatDate } from "@/lib/format";

// Ответ на заявку в поддержку прямо из админки: письмо уходит покупателю,
// ответ сохраняется под заявкой. Если ответ уже был — показываем его и даём
// отправить ещё одно письмо (например, уточнение).
export default function SupportReply({
  id,
  email,
  existing,
}: {
  id: string;
  email: string;
  existing: { text: string; at: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function send() {
    setError(null);
    start(async () => {
      const res = await replySupportRequest(id, text).catch(() => ({
        error: "Не удалось отправить — попробуйте ещё раз",
      }));
      if (res.error) {
        setError(res.error);
      } else {
        setSent(true);
        setOpen(false);
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3">
      {/* Уже отправленный ответ */}
      {existing && !open && (
        <div className="rounded-xl border-l-4 border-brand-500 bg-brand-100/50 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-brand-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ответ отправлен{existing.at ? ` · ${formatDate(existing.at)}` : ""} · на {email}
          </div>
          <p className="whitespace-pre-wrap text-sm text-brand-700">{existing.text}</p>
        </div>
      )}

      {sent && !open && !existing && (
        <div className="rounded-xl bg-brand-100/50 px-3 py-2 text-sm font-semibold text-brand-600">
          ✓ Ответ отправлен на {email}
        </div>
      )}

      {/* Форма ответа */}
      {open ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={5000}
            autoFocus
            className="input !rounded-lg"
            disabled={pending}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-brand-500">
              Уйдёт письмом на <span className="font-semibold text-brand-700">{email}</span> с основного ящика магазина
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={pending}
                className="btn-outline !px-4 !py-1.5 text-xs"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || !text.trim()}
                className="btn-primary !px-4 !py-1.5 text-xs"
              >
                {pending ? "Отправляю…" : "Отправить ответ"}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-2 rounded-lg bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-700">
              {error}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={existing ? "btn-outline mt-2 !px-4 !py-1.5 text-xs" : "btn-primary !px-4 !py-1.5 text-xs"}
        >
          {existing ? "Ответить ещё раз" : "✉ Ответить покупателю"}
        </button>
      )}
    </div>
  );
}
