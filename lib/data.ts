import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/supabase/fetch";
import { demoCategories, demoProducts } from "@/lib/demo-data";
import type { Category, Product } from "@/lib/types";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Клиент без cookie — для публичного кэшируемого чтения (категории/каталог).
// Можно использовать внутри unstable_cache (там недоступны cookies()).
function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: { fetch: fetchWithTimeout(10000) },
    }
  );
}

// Категории почти не меняются, но запрашиваются в футере на КАЖДОЙ странице.
// Кэшируем на 10 минут, чтобы медленная сеть не тормозила каждую загрузку.
const getCategoriesCached = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");
    if (error || !data) throw new Error("categories unavailable");
    return data as Category[];
  },
  ["categories-v1"],
  { revalidate: 600, tags: ["categories"] }
);

const PRODUCT_SELECT =
  "id, slug, name, description, price, category_id, image_url, stock, is_new, is_featured, created_at, category:categories(slug, name)";

export async function getCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return demoCategories;
  try {
    return await getCategoriesCached();
  } catch {
    // Таймаут/ошибка сети — не валим страницу, показываем демо-категории.
    return demoCategories;
  }
}

type ProductQuery = {
  categorySlug?: string;
  q?: string;
  sort?: "new" | "price_asc" | "price_desc" | "name";
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  onlyNew?: boolean;
  limit?: number;
};

function filterDemo(opts: ProductQuery): Product[] {
  let list = [...demoProducts];
  if (opts.categorySlug)
    list = list.filter((p) => p.category?.slug === opts.categorySlug);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
    );
  }
  if (opts.featured) list = list.filter((p) => p.is_featured);
  if (opts.onlyNew) list = list.filter((p) => p.is_new);
  if (typeof opts.minPrice === "number")
    list = list.filter((p) => p.price >= opts.minPrice!);
  if (typeof opts.maxPrice === "number")
    list = list.filter((p) => p.price <= opts.maxPrice!);
  switch (opts.sort) {
    case "price_asc": list.sort((a, b) => a.price - b.price); break;
    case "price_desc": list.sort((a, b) => b.price - a.price); break;
    case "name": list.sort((a, b) => a.name.localeCompare(b.name, "ru")); break;
    default: list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }
  return opts.limit ? list.slice(0, opts.limit) : list;
}

export async function getProducts(opts: ProductQuery = {}): Promise<Product[]> {
  if (!isSupabaseConfigured()) return filterDemo(opts);
  const supabase = createClient();
  let query = supabase.from("products").select(PRODUCT_SELECT);

  if (opts.categorySlug) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", opts.categorySlug)
      .maybeSingle();
    if (cat) query = query.eq("category_id", cat.id);
    else return [];
  }
  if (opts.q) query = query.ilike("name", `%${opts.q}%`);
  if (opts.featured) query = query.eq("is_featured", true);
  if (opts.onlyNew) query = query.eq("is_new", true);
  if (typeof opts.minPrice === "number") query = query.gte("price", opts.minPrice);
  if (typeof opts.maxPrice === "number") query = query.lte("price", opts.maxPrice);

  switch (opts.sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "name": query = query.order("name", { ascending: true }); break;
    default: query = query.order("created_at", { ascending: false });
  }
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error || !data) return filterDemo(opts);
  return data as unknown as Product[];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!isSupabaseConfigured())
    return demoProducts.find((p) => p.slug === slug) ?? null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return demoProducts.find((p) => p.slug === slug) ?? null;
  return data as unknown as Product;
}

export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  if (!isSupabaseConfigured())
    return demoProducts.filter((p) => ids.includes(p.id));
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", ids);
  if (error || !data) return demoProducts.filter((p) => ids.includes(p.id));
  return data as unknown as Product[];
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}
