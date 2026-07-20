"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Кнопка необратимого удаления: сначала спрашивает подтверждение,
// затем вызывает переданное серверное действие.
export default function DeleteButton({
  action,
  confirmText,
  redirectTo,
  title = "Удалить",
  children,
}: {
  action: () => Promise<{ ok?: boolean; error?: string }>;
  confirmText: string;
  redirectTo?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    if (!confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const res = await action();
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title={title}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/40 bg-surface px-3 py-1.5 text-xs font-semibold text-accent-600 transition hover:bg-accent-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482 41.03 41.03 0 00-2.365-.298V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
          />
        </svg>
        {pending ? "…" : children}
      </button>
      {error && <span className="text-xs text-accent-600">{error}</span>}
    </div>
  );
}
