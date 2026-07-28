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

// Демо-каталог показываем ТОЛЬКО когда база вообще не настроена, либо когда
// демо-режим включён явным флагом DEMO_MODE=true. Иначе (боевая база временно
// недоступна) НЕ подменяем реальный каталог фейковым: громко пишем в лог и
// отдаём пустой результат — фейковый товар в проде опаснее пустой страницы
// (принимает заказы, которые «исчезают»). См. аудит 11.3.
function demoAllowed(): boolean {
  return !isDbConfigured() || process.env.DEMO_MODE === "true";
}

// Next бросает DynamicServerError (digest DYNAMIC_SERVER_USAGE), чтобы ВЫЙТИ из
// статической генерации, — это управляющий сигнал, а не сбой базы. Глотать его
// нельзя: тогда Next не узнает, что страница динамическая, и запечёт в
// статический HTML результат фолбэка (пустой либо демо-каталог). SDK PocketBase
// оборачивает его в ClientResponseError со status 0, поэтому проверяем и
// вложенные причины.
//
// Возвращает САМУ ошибку Next (или null). Пробрасывать нужно именно её, а не
// обёртку PocketBase: Next опознаёт сигнал по полю digest у брошенной ошибки,
// поэтому throw обёртки он считает обычным сбоем рендера и валит сборку
// («Error occurred prerendering page»).
function dynamicServerUsageError(e: unknown): unknown | null {
  const hasDigest = (x: unknown): boolean =>
    (x as { digest?: unknown } | null)?.digest === "DYNAMIC_SERVER_USAGE";
  if (hasDigest(e)) return e;
  const err = e as { cause?: unknown; originalError?: unknown } | null;
  if (hasDigest(err?.cause)) return err!.cause;
  if (hasDigest(err?.originalError)) return err!.originalError;
  return null;
}

function onDbError(where: string, e: unknown): void {
  console.error(`[data] ${where}: PocketBase недоступен —`, e);
}

// Категории почти не меняются, но запрашиваются в футере на КАЖДОЙ странице.
// Кэшируем на 10 минут, чтобы не дёргать базу на каждую загрузку.
const getCategoriesCached = unstable_cache(
  async (): Promise<Category[]> => {
    // force-cache: читаем внутри unstable_cache, свежесть даёт revalidate/tags.
    // С no-store страницы с футером не смогли бы остаться статическими.
    const pb = createPublicPb("force-cache");
    const list = await pb
      .collection("categories")
      .getFullList({ sort: "sort_order" });
    return list.map(mapCategory);
  },
  // Версию в ключе поднимаем при изменении формы Category (добавились
  // description/seo_*): иначе после деплоя ISR отдавал бы записи старой формы
  // из дискового кэша, и вступительные тексты категорий не появились бы.
  ["categories-v3"],
  { revalidate: 600, tags: ["categories"] }
);

export async function getCategories(): Promise<Category[]> {
  if (!isDbConfigured()) return demoCategories;
  try {
    const cats = await getCategoriesCached();
    if (cats.length > 0) return cats;
    return demoAllowed() ? demoCategories : [];
  } catch (e) {
    // Таймаут/ошибка сети — не валим страницу. В проде показываем пустой
    // список категорий, а не демо-подмену (демо только при DEMO_MODE).
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getCategories", e);
    return demoAllowed() ? demoCategories : [];
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
      } catch (e) {
        const dsu = dynamicServerUsageError(e);
        if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
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
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getProducts", e);
    return demoAllowed() ? filterDemo(opts) : [];
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
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getProductBySlug", e);
    return demoAllowed()
      ? demoProducts.find((p) => p.slug === slug) ?? null
      : null;
  }
}

// Поиск товара по СТАРОМУ адресу — по id записи PocketBase или по legacy_id
// (числовой идентификатор, оставшийся от переезда с Supabase). Нужен только
// странице товара: если по слагу ничего не нашлось, но ссылка вида
// /product/<id> уже где-то проиндексирована, отдаём 301 на адрес со слагом,
// а не 404 (см. app/product/[slug]/page.tsx).
export async function getProductByLegacyRef(
  ref: string
): Promise<Product | null> {
  const numeric = /^\d+$/.test(ref) ? Number(ref) : null;
  if (!isValidRecordId(ref) && numeric === null) return null;
  if (!isDbConfigured()) return null;
  const pb = createPublicPb();
  try {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (isValidRecordId(ref)) {
      conditions.push("id = {:ref}");
      params.ref = ref;
    }
    if (numeric !== null) {
      conditions.push("legacy_id = {:legacyId}");
      params.legacyId = numeric;
    }
    const rec = await pb
      .collection("products")
      .getFirstListItem(pb.filter(conditions.join(" || "), params), {
        expand: "category",
      });
    return mapProduct(rec);
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    // Ничего не нашлось (404 от PocketBase) — это нормальный исход: адрес
    // просто не существует, страница отдаст свой 404.
    return null;
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
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getProductsByIds", e);
    return demoAllowed()
      ? demoProducts.filter((p) => valid.includes(p.id))
      : [];
  }
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) ?? null;
}

// Дата окончания отпуска (для плашки в layout — значит, запрос на КАЖДОЙ
// странице). Кэшируем, как и категории: иначе no-store-запрос выводил бы из
// статической генерации вообще все страницы сайта.
// Админка после смены даты сбрасывает кэш через revalidateTag("site-settings").
const getVacationUntilCached = unstable_cache(
  async (): Promise<string | null> => {
    const pb = createPublicPb("force-cache");
    const page = await pb.collection("site_settings").getList(1, 1);
    const value = page.items[0]?.vacation_until;
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : null;
  },
  ["site-settings-vacation-v1"],
  { revalidate: 600, tags: ["site-settings"] }
);

// Дата окончания отпуска (для плашки). null — отпуска нет / БД недоступна.
export async function getVacationUntil(): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    return await getVacationUntilCached();
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getVacationUntil", e);
    return null;
  }
}

// ===== Карта сайта =====
// Читаем БЕЗ кэша. Роут /sitemap.xml объявлен динамическим (см. app/sitemap.ts),
// поэтому вылета из статической генерации здесь уже не будет, а карта всегда
// отражает текущее состояние базы.
//
// Раньше тут стоял кэш на час — и после массовой правки (например,
// переименования артикулов скриптом) карта ещё час отдавала старые адреса.
// Сбросить его извне нельзя: sitemap.xml — метаданные Next, revalidateTag и
// revalidatePath его не задевают. Проще не кэшировать вовсе: карту запрашивают
// роботы несколько раз в сутки, а запрос — один, на три поля.
//
// updated_at идёт в <lastmod>: поисковику важна дата последней ПРАВКИ карточки
// (переписали описание сорта — приходи переобходить), а не дата её создания.
export type SitemapProduct = {
  slug: string;
  created_at: string;
  updated_at: string;
};

export async function getSitemapProducts(): Promise<SitemapProduct[]> {
  const fromDemo = (): SitemapProduct[] =>
    demoProducts.map((p) => ({
      slug: p.slug,
      created_at: p.created_at,
      updated_at: p.created_at,
    }));
  if (!isDbConfigured()) return fromDemo();
  try {
    const pb = createPublicPb();
    const list = await pb
      .collection("products")
      .getFullList({ fields: "slug,created,updated", sort: "-created" });
    return list
      .map((r) => ({
        slug: typeof r.slug === "string" ? r.slug : "",
        created_at: typeof r.created === "string" ? r.created : "",
        updated_at: typeof r.updated === "string" ? r.updated : "",
      }))
      .filter((p) => p.slug);
  } catch (e) {
    const dsu = dynamicServerUsageError(e);
    if (dsu) throw dsu; // сигнал Next выйти из статики, не сбой БД
    onDbError("getSitemapProducts", e);
    // База недоступна: лучше карта без товаров, чем фейковые URL в индексе.
    return demoAllowed() ? fromDemo() : [];
  }
}
