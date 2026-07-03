"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/icons";

const SORTS = [
  { value: "new", label: "Сначала новые" },
  { value: "price_asc", label: "Сначала дешёвые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "name", label: "По названию" },
];

export default function CatalogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const sort = params.get("sort") ?? "new";

  useEffect(() => {
    setQ(params.get("q") ?? "");
    setMin(params.get("min") ?? "");
    setMax(params.get("max") ?? "");
  }, [params]);

  function apply(overrides: Record<string, string> = {}) {
    const next = new URLSearchParams(params.toString());
    const values: Record<string, string> = { q, min, max, ...overrides };
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="card mb-5 flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="mb-1 block text-xs font-semibold text-brand-700">Поиск</span>
          <span className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название сорта"
              className="input pl-9"
            />
          </span>
        </label>
        <label className="w-full sm:w-28">
          <span className="mb-1 block text-xs font-semibold text-brand-700">Цена от</span>
          <input
            type="number"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="0"
            className="input"
          />
        </label>
        <label className="w-full sm:w-28">
          <span className="mb-1 block text-xs font-semibold text-brand-700">до</span>
          <input
            type="number"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="500"
            className="input"
          />
        </label>
        <button type="submit" className="btn-primary">
          Применить
        </button>
      </form>

      <label className="lg:w-56">
        <span className="mb-1 block text-xs font-semibold text-brand-700">Сортировка</span>
        <select
          value={sort}
          onChange={(e) => apply({ sort: e.target.value })}
          className="input"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
