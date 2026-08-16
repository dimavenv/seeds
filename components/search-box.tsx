"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { SearchIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { GOALS, reachGoal } from "@/lib/metrika";
import type { Product } from "@/lib/types";

// Поле поиска с кнопкой-лупой и живыми подсказками под полем.
// Используется и в шапке (десктоп), и в мобильном оверлее.
export default function SearchBox({
  className,
  autoFocus,
  onNavigate,
}: {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Подсвеченная стрелками подсказка (-1 — ничего не выбрано).
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Закрытие подсказок по клику вне поля.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Живой запрос подсказок с дебаунсом.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as { products?: Product[] };
        setItems(data.products ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        /* отменён/сеть — игнорируем */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    // Цель — только на явный поиск (Enter или лупа): подсказки набираются на
    // каждый второй символ, и считать их значило бы завалить отчёт мусором.
    if (query) reachGoal(GOALS.search, { query });
    onNavigate?.();
    setOpen(false);
    router.push(query ? `/catalog?q=${encodeURIComponent(query)}` : "/catalog");
  }

  function goto(slug: string) {
    onNavigate?.();
    setOpen(false);
    setQ("");
    router.push(`/product/${slug}`);
  }

  // Навигация по подсказкам с клавиатуры — как в address-suggest-input.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      goto(items[active].slug);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const query = q.trim();

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <form onSubmit={submit} className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск"
          className="input pr-14 text-base md:py-3"
          aria-label="Поиск"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && query.length >= 2}
          aria-autocomplete="list"
        />
        <button
          type="submit"
          aria-label="Искать"
          className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 p-2 text-white transition hover:bg-brand-700"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
      </form>

      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-xl">
          {items.length > 0 ? (
            <>
              <ul role="listbox" aria-label="Подсказки" className="max-h-[60vh] overflow-auto py-1">
                {items.map((p, i) => (
                  <li key={p.id} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onClick={() => goto(p.slug)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        i === active ? "bg-brand-50" : "hover:bg-brand-50"
                      }`}
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                        {p.image_url && (
                          <Image
                            src={p.image_url}
                            alt=""
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-brand-800">
                          {p.name}
                        </span>
                        <span className="block text-sm font-semibold text-brand-600">
                          {formatPrice(p.price)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={submit}
                className="block w-full border-t border-brand-100 bg-brand-50/60 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                Показать все результаты по «{query}»
              </button>
            </>
          ) : (
            <div className="px-4 py-5 text-center text-sm text-brand-500">
              {loading ? "Ищем…" : "Ничего не найдено"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
