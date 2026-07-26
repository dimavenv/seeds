"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Селект сортировки каталога. Бэкенд давно понимает ?sort= (см. lib/data.ts),
// но управлять им из интерфейса было нельзя — селект дописывает параметр в
// текущий URL, сохраняя поиск и фильтры цены.
const OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "Сначала новые" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
  { value: "name", label: "По алфавиту" },
];

export default function CatalogSort({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "new") params.delete("sort"); // значение по умолчанию — без параметра
    else params.set("sort", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-brand-500">
      <span className="hidden sm:inline">Сортировка:</span>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        aria-label="Сортировка товаров"
        className="input !w-auto !py-1.5 text-sm"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
