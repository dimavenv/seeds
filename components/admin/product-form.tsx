"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveProduct } from "@/app/admin/actions";
import type { Category, Product } from "@/lib/types";

export default function ProductForm({
  product,
  categories,
}: {
  product?: Product;
  categories: Category[];
}) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: false });
      if (upErr) {
        setError("Не удалось загрузить фото: " + upErr.message);
        return;
      }
      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("image_url", imageUrl);
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
          <input name="price" type="number" min={0} step="0.01" required defaultValue={product?.price} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">Остаток, шт.</span>
          <input name="stock" type="number" min={0} defaultValue={product?.stock ?? 0} className="input" />
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
        <textarea name="description" defaultValue={product?.description ?? ""} className="input min-h-28" />
      </label>

      <div>
        <span className="mb-1 block text-sm font-semibold text-brand-700">Фото товара</span>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
            {imageUrl && (
              <Image src={imageUrl} alt="" fill sizes="96px" className="object-cover" />
            )}
          </div>
          <div className="flex-1">
            <input type="file" accept="image/*" onChange={handleUpload} className="text-sm" />
            {uploading && <p className="mt-1 text-sm text-brand-500">Загрузка…</p>}
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="или вставьте URL изображения"
              className="input mt-2"
            />
          </div>
        </div>
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
        <p className="rounded-xl bg-accent-500/10 px-4 py-2 text-sm text-accent-600">{error}</p>
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
