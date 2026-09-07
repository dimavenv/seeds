"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { saveProduct } from "@/app/admin/actions";
import type { ImageVariantMap } from "@/lib/image-variants";
import type { Category, Product } from "@/lib/types";

export default function ProductForm({
  product,
  categories,
}: {
  product?: Product;
  categories: Category[];
}) {
  const router = useRouter();
  // Несколько фото: первое в списке — главное (показывается в каталоге).
  const initialImages =
    product?.images && product.images.length > 0
      ? product.images
      : product?.image_url
      ? [product.image_url]
      : [];
  const [images, setImages] = useState<string[]>(initialImages);
  // Облегчённые WebP-варианты по каждому фото. У фото, загруженных раньше,
  // их нет — карточка тогда показывает оригинал (см. ProductImage).
  const [variants, setVariants] = useState<ImageVariantMap>(
    product?.image_variants ?? {}
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      // Файл идёт через наш сервер (/api/admin/media), а не напрямую в
      // PocketBase: там он один раз пережимается в WebP на 400/800/1200 px.
      // Оптимизатор Next при этом остаётся выключенным — пережимать на каждый
      // запрос на одном VPS нечем.
      const uploaded: string[] = [];
      const uploadedVariants: ImageVariantMap = {};
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/admin/media", {
            method: "POST",
            body: fd,
          });
          const json = (await res.json()) as {
            url?: string;
            variants?: Record<string, string>;
            error?: string;
          };
          if (!res.ok || !json.url) {
            setError("Не удалось загрузить фото: " + (json.error ?? "ошибка"));
            continue;
          }
          uploaded.push(json.url);
          // Вариантов может не быть (битый файл) — тогда останется оригинал.
          if (json.variants && Object.keys(json.variants).length > 0)
            uploadedVariants[json.url] = json.variants;
        } catch (e) {
          setError(
            "Не удалось загрузить фото: " +
              (e instanceof Error ? e.message : "ошибка сети")
          );
        }
      }
      if (uploaded.length) setImages((prev) => [...prev, ...uploaded]);
      if (Object.keys(uploadedVariants).length > 0)
        setVariants((prev) => ({ ...prev, ...uploadedVariants }));
    } finally {
      setUploading(false);
      e.target.value = ""; // позволить выбрать те же файлы снова
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  function makePrimary(url: string) {
    setImages((prev) => [url, ...prev.filter((u) => u !== url)]);
  }

  function addByUrl(url: string) {
    const v = url.trim();
    if (v) setImages((prev) => [...prev, v]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("images", JSON.stringify(images));
    // Отправляем варианты только для фото, оставшихся в списке: удалённые
    // фото не должны тащить за собой мусор в поле image_variants.
    formData.set(
      "image_variants",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(variants).filter(([url]) => images.includes(url))
        )
      )
    );
    const res = await saveProduct({}, formData);
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.push("/admin/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
      {product && <input type="hidden" name="id" value={product.id} />}

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">Название *</span>
        <input name="name" required defaultValue={product?.name} className="input" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">Цена, ₽ *</span>
          <input
            name="price"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            required
            defaultValue={product?.price}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">Остаток, шт.</span>
          <input
            name="stock"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={product?.stock ?? 0}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">Семян в пакетике</span>
          <input
            name="seeds_per_pack"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={product?.seeds_per_pack ?? ""}
            className="input"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">Категория</span>
        <select name="category_id" defaultValue={product?.category_id ?? ""} className="input">
          <option value="">— не выбрана —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Slug (необязательно, сгенерируется из названия)
        </span>
        <input name="slug" defaultValue={product?.slug} className="input" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">Описание</span>
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
          className="input min-h-64"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Фото товара (можно несколько)
        </span>
        <p className="mb-2 text-xs text-brand-500">
          Первое фото — главное (показывается в каталоге). Наведите на фото, чтобы
          сделать его главным или удалить.
        </p>

        {images.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((url, i) => (
              <div
                key={url}
                className="group relative aspect-square overflow-hidden rounded-xl border border-brand-100 bg-brand-50"
              >
                <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    Главное
                  </span>
                )}
                <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-white"
                    >
                      Главное
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="ml-auto rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-accent-600 hover:bg-white"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="text-sm"
        />
        {uploading && <p className="mt-1 text-sm text-brand-500">Загрузка…</p>}
        <input
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addByUrl((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          placeholder="или вставьте URL изображения и нажмите Enter"
          className="input mt-2"
        />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <input type="checkbox" name="is_new" defaultChecked={product?.is_new} className="h-4 w-4" />
          Новинка
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <input type="checkbox" name="is_featured" defaultChecked={product?.is_featured} className="h-4 w-4" />
          Хит / на главную
        </label>
      </div>

      {error && (
        <p role="alert" className="alert-error">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving || uploading} className="btn-primary">
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-outline">
          Отмена
        </button>
      </div>
    </form>
  );
}
