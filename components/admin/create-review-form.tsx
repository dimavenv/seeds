"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RATINGS = [1, 2, 3, 4, 5];

export default function CreateReviewForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    author_name: "",
    rating: 5,
    text: "",
    source: "ozon",
    created_at: new Date().toISOString().slice(0, 10),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Ошибка");
        return;
      }
      setForm({ author_name: "", rating: 5, text: "", source: "ozon", created_at: new Date().toISOString().slice(0, 10) });
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-accent mb-6">
        + Добавить отзыв
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand-800">Новый отзыв</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-brand-400 hover:text-brand-700 text-xl leading-none">×</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-700">Имя автора</label>
          <input
            className="input w-full"
            required
            value={form.author_name}
            onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
            placeholder="Иван Петров"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-700">Дата отзыва</label>
          <input
            type="date"
            className="input w-full"
            value={form.created_at}
            onChange={(e) => setForm((f) => ({ ...f, created_at: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-700">Оценка</label>
          <div className="flex gap-1">
            {RATINGS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm((f) => ({ ...f, rating: n }))}
                aria-label={`Оценка ${n}`}
                aria-pressed={form.rating === n}
                className={`text-2xl transition ${n <= form.rating ? "text-amber-400" : "text-brand-200"}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-700">Источник</label>
          <select
            className="input w-full"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
          >
            <option value="ozon">Ozon</option>
            <option value="">Собственный</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-brand-700">Текст отзыва</label>
        <textarea
          className="input w-full"
          rows={4}
          required
          value={form.text}
          onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
          placeholder="Текст отзыва покупателя..."
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-accent">
          {loading ? "Сохраняем…" : "Сохранить и опубликовать"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-outline">
          Отмена
        </button>
      </div>
    </form>
  );
}
