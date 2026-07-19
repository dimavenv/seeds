import { unstable_cache } from "next/cache";
import { createPublicPb } from "@/lib/pb/server";
import {
  isDbConfigured,
  isValidRecordId,
  mapCategory,
  mapProduct,
} from "@/lib/pb/shared";
import { demoCategories, demoProducts } from "@/lib/demo-data";
import type { Category, Product } from "@/lib/types";

// Обратная совместимость со старым именем (использовалось до переезда на PB).
export { isDbConfigured as isSupabaseConfigured };

// Категории почти не меняются, но запрашиваются в футере на КАЖДОЙ странице.
// Кэшируем на 10 минут, чтобы не дёргать базу на каждую загрузку.
const getCategoriesCached = unstable_cache(
  async (): Promise<Category[]> => {
    const pb = createPublicPb();
    const list = await pb
      .collection("categories")
      .getFullList({ sort: "sort_order" });
    return list.map(mapCategory);
  },
  ["categories-v2"],
  { revalidate: 600, tags: ["categories"] }
);

export async function getCategories(): Promise<Category[]> {
  if (!isDbConfigured()) return demoCategories;
  try {
    const cats = await getCategoriesCached();
    return cats.length > 0 ? cats : demoCategories;
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

// SQLite LIKE регистронезависим только для латиницы, поэтому для кириллицы
// ищем по нескольким вариантам регистра («томат», «Томат», как ввели).
function searchVariants(q: string): string[] {
  const t = q.trim();
  const lower = t.toLowerCase();
  const capital = lower.charAt(0).toUpperCase() + lower.slice(1);
  return Array.from(new Set([t, lower, capital]));
}

const SORT_MAP: Record<NonNullable<ProductQuery["sort"]>, string> = {
  price_asc: "price",
  price_desc: "-price",
  name: "name",
  new: "-created",
};

export async function getProducts(opts: ProductQuery = {}): Promise<Product[]> {
  if (!isDbConfigured()) return filterDemo(opts);
  const pb = createPublicPb();

  try {
    const parts: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.categorySlug) {
      let categoryId: string;
      try {
        const cat = await pb
          .collection("categories")
          .getFirstListItem(pb.filter("slug = {:slug}", { slug: opts.categorySlug }));
        categoryId = cat.id;
      } catch {
        return []; // категории нет — нет и товаров
      }
      parts.push("category = {:categoryId}");
      params.categoryId = categoryId;
    }

    if (opts.q) {
      const variants = searchVariants(opts.q);
      const or = variants
        .map((_, i) => `name ~ {:q${i}}`)
        .join(" || ");
      parts.push(`(${or})`);
      variants.forEach((v, i) => (params[`q${i}`] = v));
    }

    if (opts.featured) parts.push("is_featured = true");
    if (opts.onlyNew) parts.push("is_new = true");
    if (typeof opts.minPrice === "number") {
      parts.push("price >= {:minPrice}");
      params.minPrice = opts.minPrice;
    }
    if (typeof opts.maxPrice === "number") {
      parts.push("price <= {:maxPrice}");
      params.maxPrice = opts.maxPrice;
    }

    const query = {
      filter: parts.length ? pb.filter(parts.join(" && "), params) : "",
      sort: SORT_MAP[opts.sort ?? "new"],
      expand: "category",
    };

    if (opts.limit) {
      const page = await pb.collection("products").getList(1, opts.limit, query);
      return page.items.map(mapProduct);
    }
    const list = await pb.collection("products").getFullList(query);
    return list.map(mapProduct);
  } catch {
    return filterDemo(opts);
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!isDbConfigured())
    return demoProducts.find((p) => p.slug === slug) ?? null;
  const pb = createPublicPb();
  try {
    const rec = await pb
      .collection("products")
      .getFirstListItem(pb.filter("slug = {:slug}", { slug }), {
        expand: "category",
      });
    return mapProduct(rec);
  } catch {
    return demoProducts.find((p) => p.slug === slug) ?? null;
  }
}

// Переехало в lib/pb/shared (нужно и клиенту); реэкспорт — для существующих
// серверных импортов.
export { isValidRecordId };

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const valid = Array.from(new Set(ids.filter(isValidRecordId))).slice(0, 100);
  if (valid.length === 0) return [];
  if (!isDbConfigured())
    return demoProducts.filter((p) => valid.includes(p.id));
  const pb = createPublicPb();
  try {
    const params: Record<string, unknown> = {};
    const or = valid.map((id, i) => {
      params[`id${i}`] = id;
      return `id = {:id${i}}`;
    });
    const list = await pb.collection("products").getFullList({
      filter: pb.filter(or.join(" || "), params),
      expand: "category",
    });
    return list.map(mapProduct);
  } catch {
    return demoProducts.filter((p) => valid.includes(p.id));
  }
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

// Дата окончания отпуска (для плашки). null — отпуска нет / БД недоступна.
export async function getVacationUntil(): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    const pb = createPublicPb();
    const page = await pb.collection("site_settings").getList(1, 1);
    const value = page.items[0]?.vacation_until;
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
