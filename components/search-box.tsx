"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { SearchIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
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

  const query = q.trim();

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <form onSubmit={submit} className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="Поиск: томат, перец, баклажан…"
          className="input pr-14 text-base md:py-3"
          aria-label="Поиск"
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label="Искать"
          className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 p-2 text-white transition hover:brightness-95"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
      </form>

      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-xl">
          {items.length > 0 ? (
            <>
              <ul className="max-h-[60vh] overflow-auto py-1">
                {items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => goto(p.slug)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50"
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
                        <span className="block text-sm font-semibold text-brand-700">
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
            <div className="px-4 py-5 text-center text-sm text-brand-400">
              {loading ? "Ищем…" : "Ничего не найдено"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
