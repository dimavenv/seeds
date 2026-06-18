"use client";

import { useEffect, useRef, useState } from "react";

// Структурированный адрес доставки. Собирается в строку на стороне checkout.
export type AddressValue = {
  postal_code: string;
  region: string;
  city: string;
  street: string;
  house: string;
  flat: string;
};

export const emptyAddress: AddressValue = {
  postal_code: "",
  region: "",
  city: "",
  street: "",
  house: "",
  flat: "",
};

// Ответ DaData (suggestions API). Берём только нужные поля.
type DadataData = {
  postal_code: string | null;
  region_with_type: string | null;
  city_with_type: string | null;
  settlement_with_type: string | null;
  street_with_type: string | null;
  house: string | null;
  city_fias_id: string | null;
  settlement_fias_id: string | null;
  street_fias_id: string | null;
};
type DadataSuggestion = { value: string; data: DadataData };

const TOKEN = process.env.NEXT_PUBLIC_DADATA_TOKEN;
const SUGGEST_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

// Какие поля поддерживают подсказки и как ограничивать выдачу DaData.
type Level = "city" | "street" | "house";

export default function DadataAddress({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
}) {
  // fias-контекст от выбранных подсказок — для ограничения области поиска.
  const [cityFias, setCityFias] = useState<string | null>(null);
  const [streetFias, setStreetFias] = useState<string | null>(null);

  function set<K extends keyof AddressValue>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  // Применяем выбранную подсказку: заполняем компоненты + индекс.
  function applySuggestion(level: Level, s: DadataSuggestion) {
    const d = s.data;
    const next = { ...value };
    if (d.postal_code) next.postal_code = d.postal_code;
    if (d.region_with_type) next.region = d.region_with_type;
    const cityName = d.city_with_type || d.settlement_with_type;
    if (cityName) next.city = cityName;
    if (d.street_with_type) next.street = d.street_with_type;
    if (d.house) next.house = d.house;
    onChange(next);

    // Запоминаем fias для следующего уровня.
    if (level === "city") {
      setCityFias(d.city_fias_id || d.settlement_fias_id || null);
      setStreetFias(null);
    } else if (level === "street") {
      setStreetFias(d.street_fias_id || null);
    }
  }

  // Ограничение области (locations) по выбранному городу/улице.
  function locationsFor(level: Level): object[] | undefined {
    if (level === "street" && cityFias) return [{ city_fias_id: cityFias }];
    if (level === "house" && streetFias) return [{ street_fias_id: streetFias }];
    if (level === "house" && cityFias) return [{ city_fias_id: cityFias }];
    return undefined;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SuggestField
        label="Индекс"
        required
        value={value.postal_code}
        onChange={(v) => set("postal_code", v)}
        inputMode="numeric"
        placeholder="Подставится автоматически"
        className="sm:col-span-1"
      />
      <PlainField
        label="Регион"
        value={value.region}
        onChange={(v) => set("region", v)}
        placeholder="Московская обл."
        className="sm:col-span-1"
      />
      <SuggestField
        label="Город / населённый пункт"
        required
        level="city"
        fromBound="city"
        toBound="settlement"
        locations={locationsFor("city")}
        onPick={(s) => applySuggestion("city", s)}
        value={value.city}
        onChange={(v) => set("city", v)}
        placeholder="Москва"
        className="sm:col-span-2"
      />
      <SuggestField
        label="Улица"
        required
        level="street"
        fromBound="street"
        toBound="street"
        locations={locationsFor("street")}
        onPick={(s) => applySuggestion("street", s)}
        value={value.street}
        onChange={(v) => set("street", v)}
        placeholder="ул. Ленина"
        className="sm:col-span-2"
      />
      <SuggestField
        label="Дом"
        required
        level="house"
        fromBound="house"
        toBound="house"
        locations={locationsFor("house")}
        onPick={(s) => applySuggestion("house", s)}
        value={value.house}
        onChange={(v) => set("house", v)}
        placeholder="12"
        className="sm:col-span-1"
      />
      <PlainField
        label="Квартира"
        value={value.flat}
        onChange={(v) => set("flat", v)}
        placeholder="34"
        className="sm:col-span-1"
      />
    </div>
  );
}

function FieldLabel({
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

// Обычное поле без подсказок (Регион, Квартира).
function PlainField({
  label,
  value,
  onChange,
  placeholder,
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

// Поле с подсказками DaData. Если токена/уровня нет — ведёт себя как обычное.
function SuggestField({
  label,
  value,
  onChange,
  onPick,
  level,
  fromBound,
  toBound,
  locations,
  placeholder,
  className,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick?: (s: DadataSuggestion) => void;
  level?: Level;
  fromBound?: string;
  toBound?: string;
  locations?: object[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  inputMode?: "numeric" | "text";
}) {
  const [items, setItems] = useState<DadataSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSuggest = Boolean(TOKEN && level && onPick);

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
    if (!canSuggest || !value.trim() || value.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(SUGGEST_URL, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Token ${TOKEN}`,
          },
          body: JSON.stringify({
            query: value,
            count: 7,
            from_bound: fromBound ? { value: fromBound } : undefined,
            to_bound: toBound ? { value: toBound } : undefined,
            locations: locations,
            restrict_value: Boolean(locations),
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { suggestions?: DadataSuggestion[] };
        setItems(json.suggestions ?? []);
        setActive(-1);
      } catch {
        /* отменённый/сетевой запрос — игнорируем */
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, canSuggest]);

  function pick(s: DadataSuggestion) {
    onPick?.(s);
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
      {canSuggest && open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-brand-200 bg-white py-1 shadow-lg"
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
