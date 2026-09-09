"use client";

import { useRef, useState } from "react";
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
  const [uploadCount, setUploadCount] = useState(0);
  const [isUploadDragActive, setIsUploadDragActive] = useState(false);
  const [draggedImage, setDraggedImage] = useState<number | null>(null);
  const [dragOverImage, setDragOverImage] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadCount(files.length);
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
      if (uploaded.length)
        setImages((prev) => [
          ...prev,
          ...uploaded.filter((url) => !prev.includes(url)),
        ]);
      if (Object.keys(uploadedVariants).length > 0)
        setVariants((prev) => ({ ...prev, ...uploadedVariants }));
    } finally {
      setUploading(false);
      setUploadCount(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(e.target.files ?? []));
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  function makePrimary(url: string) {
    setImages((prev) => [url, ...prev.filter((u) => u !== url)]);
  }

  function addByUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    setImages((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setImageUrl("");
  }

  function moveImage(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
    <form onSubmit={handleSubmit} className="card w-full max-w-5xl space-y-8 p-5 sm:p-8">
      {product && <input type="hidden" name="id" value={product.id} />}

      <section className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-brand-700">Название товара *</span>
          <input name="name" required defaultValue={product?.name} className="input text-base" />
        </label>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-brand-700">Цена, ₽ *</span>
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
            <span className="mb-2 block text-sm font-semibold text-brand-700">Остаток, шт.</span>
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
            <span className="mb-2 block text-sm font-semibold text-brand-700">Семян в пакетике</span>
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

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-brand-700">Категория</span>
            <select name="category_id" defaultValue={product?.category_id ?? ""} className="input">
              <option value="">— не выбрана —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-brand-700">
              Slug (необязательно)
            </span>
            <input name="slug" defaultValue={product?.slug} className="input" />
            <span className="mt-1.5 block text-xs text-brand-500">
              Если оставить пустым, адрес создастся из названия.
            </span>
          </label>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="font-bold text-brand-800">Описание товара</h3>
          <p className="mt-1 text-sm text-brand-500">Поле можно дополнительно растянуть за правый нижний угол.</p>
        </div>
        <textarea
          name="description"
          defaultValue={product?.description ?? ""}
          className="input min-h-[28rem] resize-y text-base leading-relaxed"
          placeholder="Подробно опишите сорт, особенности выращивания, сроки созревания и вкус…"
        />
      </section>

      <section>
        <div className="mb-4">
          <h3 className="font-bold text-brand-800">Фотографии товара</h3>
          <p className="mt-1 text-sm text-brand-500">
            Первое большое фото — главное. Перетаскивайте фотографии, чтобы изменить порядок.
          </p>
        </div>

        {images.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {images.map((url, i) => (
              <div
                key={url}
                draggable
                onDragStart={() => setDraggedImage(i)}
                onDragEnter={() => setDragOverImage(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedImage !== null) moveImage(draggedImage, i);
                  setDraggedImage(null);
                  setDragOverImage(null);
                }}
                onDragEnd={() => {
                  setDraggedImage(null);
                  setDragOverImage(null);
                }}
                className={`group relative cursor-grab overflow-hidden rounded-2xl border-2 bg-brand-50 shadow-sm transition active:cursor-grabbing ${
                  i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"
                } ${
                  dragOverImage === i && draggedImage !== i
                    ? "scale-[1.02] border-brand-500 ring-4 ring-brand-100"
                    : "border-white"
                } ${draggedImage === i ? "opacity-50" : "opacity-100"}`}
              >
                <Image
                  src={url}
                  alt={`Фото товара ${i + 1}`}
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 360px, 50vw" : "180px"}
                  className="pointer-events-none object-cover transition duration-300 group-hover:scale-[1.03]"
                />
                {i === 0 && (
                  <span className="absolute left-3 top-3 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow">
                    Главное
                  </span>
                )}
                <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  Перетащить
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      className="rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-brand-700 shadow hover:bg-white"
                    >
                      Сделать главным
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="ml-auto rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-accent-600 shadow hover:bg-white"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsUploadDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsUploadDragActive(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setIsUploadDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsUploadDragActive(false);
            void uploadFiles(
              Array.from(e.dataTransfer.files).filter((file) =>
                file.type.startsWith("image/")
              )
            );
          }}
          className={`relative flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
            isUploadDragActive
              ? "border-brand-500 bg-brand-100 ring-4 ring-brand-100/70"
              : "border-brand-200 bg-brand-50/60 hover:border-brand-400 hover:bg-brand-50"
          }`}
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
            {uploading ? (
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5M8 8l4-4 4 4m-4-4v13" />
              </svg>
            )}
          </div>
          <p className="font-semibold text-brand-800">
            {uploading
              ? `Загружаю ${uploadCount} ${uploadCount === 1 ? "фото" : "фото"}…`
              : isUploadDragActive
              ? "Отпустите фотографии здесь"
              : "Перетащите фотографии сюда"}
          </p>
          <p className="mt-1 text-sm text-brand-500">или выберите их с компьютера</p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="btn-outline mt-4 bg-white"
          >
            Выбрать фотографии
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="sr-only"
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addByUrl();
              }
            }}
            placeholder="Или вставьте ссылку на изображение"
            className="input"
          />
          <button type="button" onClick={addByUrl} className="btn-outline shrink-0">
            Добавить ссылку
          </button>
        </div>
      </section>

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
