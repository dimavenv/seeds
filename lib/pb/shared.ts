// Общие помощники PocketBase — без серверных зависимостей,
// используются и на сервере, и на клиенте.
import { parseVariantMap } from "@/lib/image-variants";
import type {
  Category,
  Order,
  OrderItem,
  Product,
  Review,
  SupportRequest,
} from "@/lib/types";

export const PB_COOKIE = "pb_auth";

// ID записей PocketBase: строка из букв/цифр (стандартно 15 символов).
// Живёт здесь (а не в lib/data), чтобы был доступен и клиентскому коду.
export function isValidRecordId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{8,32}$/i.test(id);
}

// Настроен ли PocketBase. NEXT_PUBLIC_PB_URL вшивается в клиентский бандл на
// этапе сборки; на сервере берётся из окружения (его передаёт pm2).
export function isDbConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PB_URL);
}

// Публичный адрес PocketBase (для браузера: файлы, вход, корзина).
export function publicPbUrl(): string {
  return (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/+$/, "");
}

// URL файла записи PocketBase. Всегда строится от ПУБЛИЧНОГО адреса, потому
// что ссылку открывает браузер покупателя, а не сервер.
export function fileUrl(
  collection: string,
  recordId: string,
  filename: string
): string {
  return `${publicPbUrl()}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;
}

// ===== Маппинг записей PocketBase на типы приложения =====
// PB отдаёт «плоские» записи с системными полями (id, created, expand);
// пустые значения приходят как "" или 0 — приводим к прежним null-семантикам.

type R = Record<string, unknown> & {
  id: string;
  created?: string;
  expand?: Record<string, unknown>;
};

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const n = (v: unknown): number => (typeof v === "number" ? v : 0);

export function mapCategory(r: R): Category {
  return {
    id: r.id,
    slug: s(r.slug),
    name: s(r.name),
    sort_order: n(r.sort_order),
    description: s(r.description) || null,
    seo_title: s(r.seo_title) || null,
    seo_description: s(r.seo_description) || null,
  };
}

export function mapProduct(r: R): Product {
  const cat = r.expand?.category as R | undefined;
  const images = Array.isArray(r.images)
    ? (r.images as unknown[]).filter((u): u is string => typeof u === "string" && !!u)
    : [];
  return {
    id: r.id,
    slug: s(r.slug),
    name: s(r.name),
    description: s(r.description) || null,
    price: n(r.price),
    category_id: s(r.category) || null,
    image_url: s(r.image_url) || images[0] || null,
    images,
    image_variants: parseVariantMap(r.image_variants),
    stock: n(r.stock),
    seeds_per_pack: n(r.seeds_per_pack) || null,
    is_new: !!r.is_new,
    is_featured: !!r.is_featured,
    created_at: s(r.created),
    category: cat ? { slug: s(cat.slug), name: s(cat.name) } : null,
  };
}

export function mapOrder(r: R, items?: OrderItem[]): Order {
  return {
    id: r.id,
    number: n(r.number),
    customer_name: s(r.customer_name),
    phone: s(r.phone),
    email: s(r.email) || null,
    address: s(r.address),
    comment: s(r.comment) || null,
    status: (s(r.status) || "new") as Order["status"],
    total: n(r.total),
    delivery_method: s(r.delivery_method) || null,
    delivery_cost: n(r.delivery_cost),
    tracking_number: s(r.tracking_number) || null,
    payment_status: (s(r.payment_status) || "unpaid") as Order["payment_status"],
    alfa_order_id: s(r.alfa_order_id) || null,
    refunded_amount: n(r.refunded_amount),
    user_id: s(r.user) || null,
    // Дата оформления: placed_at (у перенесённых заказов — исходная), иначе created.
    created_at: s(r.placed_at) || s(r.created),
    order_items: items,
  };
}

export function mapOrderItem(r: R): OrderItem {
  return {
    id: r.id,
    order_id: s(r.order),
    product_id: s(r.product) || null,
    name: s(r.name),
    price: n(r.price),
    qty: n(r.qty) || 1,
    refunded_qty: n(r.refunded_qty),
  };
}

export function mapReview(r: R): Review {
  const product = r.expand?.product as R | undefined;
  return {
    id: r.id,
    user_id: s(r.user) || null,
    order_id: s(r.order) || null,
    product_id: s(r.product) || null,
    product_name: product ? s(product.name) || null : null,
    author_name: s(r.author_name),
    rating: n(r.rating),
    text: s(r.text),
    status: (s(r.status) || "pending") as Review["status"],
    source: s(r.source) || null,
    // Дата публикации: published_at (задаётся при создании/импорте), иначе created.
    created_at: s(r.published_at) || s(r.created),
  };
}

export function mapSupportRequest(r: R): SupportRequest {
  return {
    id: r.id,
    name: s(r.name),
    email: s(r.email),
    subject: s(r.subject),
    message: s(r.message),
    status: s(r.status) || "new",
    reply: s(r.reply) || null,
    replied_at: s(r.replied_at) || null,
    user_id: s(r.user) || null,
    created_at: s(r.created),
  };
}
