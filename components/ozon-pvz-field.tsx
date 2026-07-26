"use client";

import AddressSuggestInput from "@/components/address-suggest-input";
import { ozonRestrictedRegion } from "@/lib/delivery";

// Пункт выдачи Ozon покупатель пишет вручную (без карты и списка). Все точки —
// по ссылке на карту пунктов выдачи Ozon. Доставка в Крым, Калининград и на
// Камчатку через Ozon недоступна — предупреждаем сразу при вводе.
export default function OzonPvzField({
  value,
  onChange,
  onRegionKladr,
}: {
  value: string;
  onChange: (v: string) => void;
  // Код региона (KLADR) выбранной подсказки DaData — для авторитетной проверки
  // ограничений Ozon на сервере. null, когда покупатель правит адрес вручную.
  onRegionKladr?: (kladrId: string | null) => void;
}) {
  const restricted = ozonRestrictedRegion(value);

  return (
    <div className="space-y-2">
      <AddressSuggestInput
        label="Адрес пункта выдачи Ozon"
        required
        value={value}
        onChange={(v) => {
          onChange(v);
          // Ручная правка обнуляет привязку к нормализованному региону.
          onRegionKladr?.(null);
        }}
        onPick={(s) => {
          onChange(s.value);
          onRegionKladr?.(s.data?.region_kladr_id ?? null);
        }}
        placeholder="Например: г Краснодар, ул Красная, д 176"
      />
      <p className="text-xs text-brand-500">
        Напишите удобный пункт выдачи Ozon. Найти адрес и посмотреть все точки
        можно на{" "}
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
      {restricted && (
        <p role="alert" className="alert-error">
          Доставка Ozon в регион «{restricted}» недоступна. Выберите другой пункт
          выдачи или способ доставки «Почта России».
        </p>
      )}
    </div>
  );
}
