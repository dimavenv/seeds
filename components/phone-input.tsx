"use client";

import { useId } from "react";
import { formatLocalPhone, localPhoneDigits } from "@/lib/profile";

// Поле телефона с готовым «+7».
//
// Код страны нарисован слева от поля и не редактируется: покупатель вводит
// только 10 цифр своего номера, а сайт сам расставляет пробелы и дефисы
// (999 123-45-67). Так не бывает ни «8 (999)…», ни «+7 8 999…», ни пустого
// поля, в которое непонятно, с чего начинать.
//
// Наружу (onChange) уходит номер целиком, в хранимом виде +7XXXXXXXXXX —
// такой же, какой делает normalizePhone из lib/profile. Разбор и формат живут
// там же: чистые функции удобнее тестировать отдельно от разметки.

export default function PhoneInput({
  value,
  onChange,
  required,
  autoComplete = "tel",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  id?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const digits = localPhoneDigits(value);

  return (
    <div className="flex items-stretch rounded-xl border border-brand-200 bg-surface focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
      <span
        aria-hidden="true"
        className="flex select-none items-center rounded-l-xl border-r border-brand-100 px-3 text-sm font-semibold text-brand-600"
      >
        +7
      </span>
      <input
        id={inputId}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        required={required}
        value={formatLocalPhone(digits)}
        onChange={(e) => {
          const next = localPhoneDigits(e.target.value);
          onChange(next ? `+7${next}` : "");
        }}
        aria-label="Телефон, код страны +7"
        className="w-full min-w-0 rounded-r-xl bg-transparent px-3 py-2.5 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none"
      />
    </div>
  );
}
