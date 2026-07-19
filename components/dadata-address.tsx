"use client";

import { useEffect, useRef, useState } from "react";
import { suggestAddress, hasDadata, type DadataSuggestion } from "@/lib/dadata";
import AddressSuggestInput, {
  FieldLabel,
} from "@/components/address-suggest-input";

// Структурированный адрес доставки (Почта России). Собирается в строку на
// стороне checkout. Однострочный ПВЗ Ozon живёт в отдельном компоненте.
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

// Уровни, на которых подсказки ограничивают выдачу DaData.
type Level = "city" | "street" | "house";

// Определить индекс по свободно введённому адресу (когда подсказку не выбирали).
async function fetchAddressZip(
  query: string,
  signal?: AbortSignal
): Promise<string | null> {
  const list = await suggestAddress({ query, count: 1, signal });
  return list[0]?.data.postal_code ?? null;
}

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

  // Индекс был проставлен автоматически (подсказкой/автоопределением)?
  // Если пользователь правил индекс руками — не перезаписываем.
  const autoZipRef = useRef(false);
  const lastZipQueryRef = useRef("");
  const zipAbortRef = useRef<AbortController | null>(null);

  function set<K extends keyof AddressValue>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  // Применяем выбранную подсказку: заполняем компоненты + индекс.
  function applySuggestion(level: Level, s: DadataSuggestion) {
    const d = s.data;
    const next = { ...value };
    if (d.postal_code) {
      next.postal_code = d.postal_code;
      autoZipRef.current = true;
    }
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

  // Автоопределение индекса при ручном вводе адреса (без выбора подсказки):
  // как только заполнены Город+Улица+Дом, запрашиваем индекс по полному адресу.
  useEffect(() => {
    if (!hasDadata) return;
    const city = value.city.trim();
    const street = value.street.trim();
    const house = value.house.trim();
    if (!city || !street || !house) return;
    // только если индекс пуст или был проставлен автоматически
    if (value.postal_code.trim() && !autoZipRef.current) return;
    const query = `${city}, ${street}, ${house}`;
    if (query === lastZipQueryRef.current) return;
    const t = setTimeout(async () => {
      zipAbortRef.current?.abort();
      const ctrl = new AbortController();
      zipAbortRef.current = ctrl;
      const zip = await fetchAddressZip(query, ctrl.signal);
      lastZipQueryRef.current = query;
      if (zip && zip !== value.postal_code) {
        autoZipRef.current = true;
        onChange({ ...value, postal_code: zip });
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.city, value.street, value.house, value.postal_code]);

  // Ограничение области (locations) по выбранному городу/улице.
  function locationsFor(level: Level): object[] | undefined {
    if (level === "street" && cityFias) return [{ city_fias_id: cityFias }];
    if (level === "house" && streetFias) return [{ street_fias_id: streetFias }];
    if (level === "house" && cityFias) return [{ city_fias_id: cityFias }];
    return undefined;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AddressSuggestInput
        label="Город / населённый пункт"
        required
        fromBound="city"
        toBound="settlement"
        locations={locationsFor("city")}
        onPick={(s) => applySuggestion("city", s)}
        value={value.city}
        onChange={(v) => set("city", v)}
        placeholder="Москва"
        className="sm:col-span-2"
      />
      <PlainField
        label="Регион"
        value={value.region}
        onChange={(v) => set("region", v)}
        placeholder="Московская обл."
        className="sm:col-span-2"
      />
      <AddressSuggestInput
        label="Улица"
        required
        fromBound="street"
        toBound="street"
        locations={locationsFor("street")}
        onPick={(s) => applySuggestion("street", s)}
        value={value.street}
        onChange={(v) => set("street", v)}
        placeholder="ул. Ленина"
        className="sm:col-span-2"
      />
      <AddressSuggestInput
        label="Дом"
        required
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
      {/* Индекс — последним; определяется автоматически, можно поправить */}
      <PlainField
        label="Индекс"
        required
        value={value.postal_code}
        onChange={(v) => {
          autoZipRef.current = false;
          set("postal_code", v);
        }}
        inputMode="numeric"
        placeholder="Определится автоматически"
        className="sm:col-span-1"
      />
    </div>
  );
}

// Обычное поле без подсказок (Регион, Квартира, Индекс).
function PlainField({
  label,
  value,
  onChange,
  placeholder,
  className,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  inputMode?: "numeric" | "text";
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
        inputMode={inputMode}
      />
    </label>
  );
}
