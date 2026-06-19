"use client";

import Link from "next/link";

// Чекбокс согласия на обработку персональных данных (152-ФЗ).
// Обязателен для любой отправки данных на сервер.
export default function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-brand-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-600"
      />
      <span>
        Я согласен на обработку персональных данных в соответствии с{" "}
        <Link
          href="/privacy"
          target="_blank"
          className="font-semibold text-brand-700 underline hover:text-brand-800"
        >
          Политикой конфиденциальности
        </Link>
        .
      </span>
    </label>
  );
}
