"use client";

import AddressSuggestInput from "@/components/address-suggest-input";
import type { DadataSuggestion } from "@/lib/dadata";

// Однострочное поле адреса пункта выдачи Ozon (ПВЗ) для оформления заказа.
// Подсказки адресов — через DaData; точку выдачи пользователь выбирает на карте
// Ozon и вводит её адрес одной строкой.
export default function OzonPvzField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  function onPick(s: DadataSuggestion) {
    onChange(s.value);
  }

  return (
    <div className="space-y-2">
      <AddressSuggestInput
        label="Адрес пункта выдачи Ozon (ПВЗ)"
        required
        value={value}
        onChange={onChange}
        onPick={onPick}
        placeholder="г Москва, ул Тверская, д 7"
      />
      <p className="text-xs text-brand-500">
        Укажите адрес выбранного пункта выдачи Ozon одной строкой — начните
        вводить, и мы подскажем. Найти ближайший ПВЗ и его точный адрес можно на{" "}
        <a
          href="https://www.ozon.ru/geo/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent-600 underline underline-offset-2"
        >
          карте пунктов выдачи Ozon
        </a>
        .
      </p>
    </div>
  );
}
