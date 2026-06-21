"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { OrderStatus } from "@/lib/types";

function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  return input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type ProductFormState = { error?: string; ok?: boolean };

export async function saveProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await getSession();
  if (!session.isAdmin) return { error: "Нет доступа" };

  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const categoryId = formData.get("category_id")
    ? Number(formData.get("category_id"))
    : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  // Несколько фото приходят JSON-массивом; image_url — первое (главное) фото.
  let images: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("images") ?? "[]"));
    if (Array.isArray(parsed)) {
      images = parsed.filter((u): u is string => typeof u === "string" && !!u.trim());
    }
  } catch {
    images = [];
  }
  const imageUrl = images[0] ?? null;
  const stock = Number(formData.get("stock") ?? 0);
  const seedsRaw = String(formData.get("seeds_per_pack") ?? "").trim();
  const seedsPerPack = seedsRaw ? Number(seedsRaw) : null;
  const isNew = formData.get("is_new") === "on";
  const isFeatured = formData.get("is_featured") === "on";
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: "Укажите название" };
  if (!slug) slug = slugify(name) || `tovar-${Date.now()}`;

  const supabase = createClient();
  const payload = {
    name,
    slug,
    price,
    category_id: categoryId,
    description,
    image_url: imageUrl,
    images,
    stock,
    seeds_per_pack: seedsPerPack,
    is_new: isNew,
    is_featured: isFeatured,
  };

  const { error } = id
    ? await supabase.from("products").update(payload).eq("id", id)
    : await supabase.from("products").insert(payload);

  if (error) return { error: error.message };

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProduct(id: number): Promise<void> {
  const session = await getSession();
  if (!session.isAdmin) return;
  const supabase = createClient();
  await supabase.from("products").delete().eq("id", id);
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
}

export async function updateOrderStatus(
  id: number,
  status: OrderStatus
): Promise<void> {
  const session = await getSession();
  if (!session.isAdmin) return;
  const supabase = createClient();
  await supabase.from("orders").update({ status }).eq("id", id);
  revalidatePath("/admin/orders");
}

export async function updateOrderTracking(
  id: number,
  tracking: string
): Promise<void> {
  const session = await getSession();
  if (!session.isAdmin) return;
  const value = tracking.trim() || null;
  const supabase = createClient();
  await supabase.from("orders").update({ tracking_number: value }).eq("id", id);
  revalidatePath("/admin/orders");
}
