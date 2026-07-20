"use client";

import OzonPvzPicker, {
  type OzonPvzSelection,
} from "@/components/ozon-pvz-picker";

export type { OzonPvzSelection };

// Выбор пункта выдачи Ozon при оформлении заказа: карта + список с поиском.
export default function OzonPvzField({
  value,
  onChange,
}: {
  value: OzonPvzSelection | null;
  onChange: (v: OzonPvzSelection | null) => void;
}) {
  return <OzonPvzPicker value={value} onChange={onChange} />;
}
