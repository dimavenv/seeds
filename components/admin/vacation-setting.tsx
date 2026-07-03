"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVacationUntil } from "@/app/admin/actions";
import { formatDateRu } from "@/lib/format";

export default function VacationSetting({ until }: { until: string | null }) {
  const [value, setValue] = useState(until ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  function save(date: string | null) {
    start(async () => {
      await updateVacationUntil(date);
      router.refresh();
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-lg font-bold text-brand-800">Режим «Отпуск»</h2>
      <p className="mt-1 text-sm text-brand-400">
        Укажите дату, до которой вы в отпуске. На сайте появится плашка, что
        заказы принимаются, но будут отправлены после этой даты. Без даты плашки
        нет.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Отправим заказы после
          </span>
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input !w-auto"
          />
        </label>
        <button
          type="button"
          disabled={pending || !value}
          onClick={() => save(value)}
          className="btn-primary"
        >
          {pending ? "Сохранение…" : "Включить отпуск"}
        </button>
        {until && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setValue("");
              save(null);
            }}
            className="btn-outline"
          >
            Выключить
          </button>
        )}
      </div>

      {until && (
        <p className="mt-3 text-sm text-brand-700">
          Сейчас включён отпуск: заказы отправятся после{" "}
          <span className="font-semibold text-brand-800">
            {formatDateRu(until)}
          </span>
          .
        </p>
      )}
    </div>
  );
}
