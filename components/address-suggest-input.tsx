"use client";

import { useEffect, useRef, useState } from "react";
import { suggestAddress, hasDadata, type DadataSuggestion } from "@/lib/dadata";

export function FieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <span className="mb-1 block text-sm font-semibold text-brand-700">
      {label} {required && "*"}
    </span>
  );
}

// Однострочное поле адреса с подсказками DaData (combobox).
// Если токена нет — ведёт себя как обычное текстовое поле.
export default function AddressSuggestInput({
  label,
  value,
  onChange,
  onPick,
  fromBound,
  toBound,
  locations,
  restrictValue,
  placeholder,
  className,
  required,
  minChars = 2,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: DadataSuggestion) => void;
  fromBound?: string;
  toBound?: string;
  locations?: object[];
  restrictValue?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
  minChars?: number;
  inputMode?: "numeric" | "text";
}) {
  const [items, setItems] = useState<DadataSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Закрытие выпадашки по клику вне поля.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Запрос подсказок с дебаунсом.
  useEffect(() => {
    if (!hasDadata || value.trim().length < minChars) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const list = await suggestAddress({
        query: value,
        count: 7,
        fromBound,
        toBound,
        locations,
        restrictValue,
        signal: ctrl.signal,
      });
      setItems(list);
      setActive(-1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function pick(s: DadataSuggestion) {
    onPick(s);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative block ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="input"
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
      />
      {hasDadata && open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-brand-200 bg-surface py-1 shadow-lg"
        >
          {items.map((s, i) => (
            <li key={`${s.value}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`block w-full px-4 py-2 text-left text-sm ${
                  i === active ? "bg-brand-50 text-brand-800" : "text-brand-700"
                }`}
              >
                {s.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
