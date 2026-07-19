"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateProductInline, deleteProduct } from "@/app/admin/actions";
import { formatPrice } from "@/lib/format";
import { getCategoryEmoji } from "@/lib/categories";
import type { Category, Product } from "@/lib/types";

type Tab = "on_sale" | "ready";

// Инлайн-редактируемое числовое поле (цена или остаток).
function InlineNumber({
  value,
  suffix,
  onSave,
}: {
  value: number;
  suffix?: string;
  onSave: (v: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const num = Number(draft.replace(",", "."));
    if (Number.isNaN(num) || num === value) {
      setEditing(false);
      setDraft(String(value));
      return;
    }
    setSaving(true);
    await onSave(num);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-brand-800 hover:bg-brand-50"
        title="Нажмите, чтобы изменить"
      >
        <span className="font-semibold">{value}</span>
        {suffix && <span className="text-brand-400">{suffix}</span>}
        <svg className="h-3 w-3 text-brand-300 opacity-0 transition group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.464.263l-3 .75a1 1 0 01-1.213-1.213l.75-3a1 1 0 01.263-.464l8.5-8.5z" />
        </svg>
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setEditing(false);
          setDraft(String(value));
        }
      }}
      className="w-24 rounded-md border border-brand-300 px-2 py-1 text-sm outline-none focus:border-accent-500"
    />
  );
}

// Чип фильтра по категории — в том же стиле, что CategoryNav в каталоге.
const catChip = (active: boolean) =>
  `whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
    active
      ? "bg-brand-600 text-white"
      : "bg-brand-50 text-brand-700 hover:bg-brand-100"
  }`;

function StatusPill({ inStock }: { inStock: boolean }) {
  return inStock ? (
    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
      В продаже
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      Готов к продаже
    </span>
  );
}

export default function ProductsTable({
  products,
  categories,
}: {
  products: Product[];
  categories: Category[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("on_sale");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  const onSaleCount = products.filter((p) => p.stock > 0).length;
  const readyCount = products.filter((p) => p.stock <= 0).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchTab = tab === "on_sale" ? p.stock > 0 : p.stock <= 0;
      const matchCategory = !categoryId || p.category_id === categoryId;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q);
      return matchTab && matchCategory && matchQuery;
    });
  }, [products, tab, categoryId, query]);

  async function saveField(id: string, fields: { price?: number; stock?: number }) {
    await updateProductInline(id, fields);
    startTransition(() => router.refresh());
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "on_sale", label: "В продаже", count: onSaleCount },
    { id: "ready", label: "Готов к продаже", count: readyCount },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-brand-800">Список товаров</h2>
        <Link href="/admin/products/new" className="btn-accent">
          + Добавить товар
        </Link>
      </div>

      {/* Вкладки */}
      <div className="mb-4 flex gap-1 border-b border-brand-100">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? "border-b-2 border-accent-500 text-brand-800"
                : "border-b-2 border-transparent text-brand-400 hover:text-brand-600"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                tab === t.id
                  ? "bg-accent-500 text-white"
                  : "bg-brand-100 text-brand-500"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Категории — те же чипы, что и в каталоге */}
      {categories.length > 0 && (
        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={catChip(!categoryId)}
          >
            🌱 Все семена
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={catChip(categoryId === c.id)}
            >
              {getCategoryEmoji(c.slug)} {c.name}
            </button>
          ))}
        </nav>
      )}

      {/* Поиск */}
      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название или артикул…"
          className="input w-full max-w-md"
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-brand-50 text-left text-brand-500">
            <tr>
              <th className="p-3">Фото</th>
              <th>Название</th>
              <th>Статус</th>
              <th>Цена</th>
              <th>Остаток</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-brand-100 hover:bg-brand-50/40">
                <td className="p-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-brand-50">
                    {p.image_url && (
                      <Image src={p.image_url} alt="" fill sizes="48px" className="object-cover" />
                    )}
                  </div>
                </td>
                <td className="max-w-xs py-2 pr-3 font-semibold text-brand-800">
                  <span className="line-clamp-2">{p.name}</span>
                  {p.is_new && <span className="badge ml-1 bg-brand-500 text-white">new</span>}
                  {p.is_featured && <span className="badge ml-1 bg-accent-500 text-white">hit</span>}
                </td>
                <td className="pr-3">
                  <StatusPill inStock={p.stock > 0} />
                </td>
                <td className="pr-3">
                  <InlineNumber
                    value={p.price}
                    suffix="₽"
                    onSave={(v) => saveField(p.id, { price: v })}
                  />
                </td>
                <td className="pr-3">
                  <InlineNumber
                    value={p.stock}
                    suffix="шт"
                    onSave={(v) => saveField(p.id, { stock: v })}
                  />
                </td>
                <td className="space-x-3 whitespace-nowrap pr-3 text-right">
                  <Link href={`/admin/products/${p.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                    Изменить
                  </Link>
                  <button
                    onClick={() => {
                      if (!confirm("Удалить товар?")) return;
                      startTransition(async () => {
                        await deleteProduct(p.id);
                        router.refresh();
                      });
                    }}
                    className="text-sm font-semibold text-accent-600 hover:underline"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-brand-500">
                  {query
                    ? "Ничего не найдено."
                    : categoryId
                    ? "В этой категории таких товаров нет."
                    : tab === "ready"
                    ? "Нет товаров, ожидающих пополнения."
                    : "Нет товаров в продаже."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-brand-400">
        Подсказка: нажмите на цену или остаток, чтобы изменить прямо в таблице.
        Когда остаток становится 0 — товар переходит во вкладку «Готов к
        продаже».
      </p>
    </div>
  );
}
