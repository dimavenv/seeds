// Перенос данных Supabase → PocketBase (одноразово, см. SETUP-DB-RU.md).
//
//   node scripts/migrate-from-supabase.mjs --dry          # проба без записи
//   node scripts/migrate-from-supabase.mjs                # перенос
//   node scripts/migrate-from-supabase.mjs --with-users   # + аккаунты покупателей
//   node scripts/migrate-from-supabase.mjs --skip-images  # не перекачивать фото
//
// Нужны переменные (в .env.production или окружении):
//   NEXT_PUBLIC_SUPABASE_URL (или SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
//   PB_URL (по умолч. http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// Что делает:
//   1. categories, products — по slug (существующие пропускает).
//      Все фото скачиваются и перезаливаются в коллекцию media PocketBase —
//      после отключения Supabase ссылки на его Storage умрут.
//   2. (--with-users) аккаунты: email+имя+роль, пароли задать нельзя —
//      генерируются новые и пишутся в migrate-users-passwords.txt.
//   3. orders + order_items — номер заказа сохраняется (поле number),
//      дата — в placed_at. Зашифрованные телефоны/адреса переносятся как есть
//      (тот же DATA_ENCRYPTION_KEY продолжит их расшифровывать).
//   4. reviews (published_at = старая дата), support_requests, site_settings.
//
// Скрипт идемпотентен — можно запускать повторно, дубликатов не будет.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import PocketBase from "pocketbase";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const WITH_USERS = args.has("--with-users");
const SKIP_IMAGES = args.has("--skip-images");

function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
loadEnvFile(path.join(root, ".env.production"));
loadEnvFile(path.join(root, ".env.local"));

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PB_URL = (process.env.PB_URL || process.env.PB_INTERNAL_URL || "http://127.0.0.1:8090").replace(/\/+$/, "");

if (!SB_URL || !SB_KEY) {
  console.error("Задайте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (старые ключи Supabase).");
  process.exit(1);
}
if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
  console.error("Задайте PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD.");
  process.exit(1);
}

// Канал с российского VPS до Supabase бывает нестабильным (обрывы «terminated»),
// а бесплатный проект может «просыпаться». Повторяем каждый HTTP-запрос с
// нарастающей паузой и держим щедрый таймаут.
async function retryFetch(input, init = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(90000),
      });
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) {
        const wait = 1500 * 2 ** i;
        console.warn(`  ↻ обрыв соединения с Supabase, повтор через ${wait / 1000}с…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false },
  global: { fetch: retryFetch },
});
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD
);

const stats = {};
const bump = (k, v = 1) => (stats[k] = (stats[k] ?? 0) + v);

async function sbAll(table, orderCol = "id") {
  // Небольшими страницами (легче для нестабильного канала) до конца таблицы.
  const PAGE = 200;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function findFirst(collection, filter, params) {
  try {
    return await pb.collection(collection).getFirstListItem(pb.filter(filter, params));
  } catch {
    return null;
  }
}

// ---------- 1. Категории ----------
console.log("— Категории…");
const categories = await sbAll("categories");
const catMap = new Map(); // старый id -> новый id
for (const c of categories) {
  const existing = await findFirst("categories", "slug = {:slug}", { slug: c.slug });
  if (existing) {
    catMap.set(c.id, existing.id);
    bump("categories: уже есть");
    continue;
  }
  if (DRY) { bump("categories: будет создано"); continue; }
  const rec = await pb.collection("categories").create({
    slug: c.slug,
    name: c.name,
    sort_order: c.sort_order ?? 0,
  });
  catMap.set(c.id, rec.id);
  bump("categories: создано");
}

// ---------- 2. Товары (с перекачкой фото) ----------
async function rehostImage(url) {
  if (SKIP_IMAGES) return url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!type.startsWith("image/")) throw new Error(`не картинка: ${type}`);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }[type] ?? "jpg";
    const name = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16) + "." + ext;
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type }), name);
    fd.append("note", url.slice(0, 500));
    const rec = await pb.collection("media").create(fd);
    bump("фото: перезалито");
    // Публичный URL строим от NEXT_PUBLIC_PB_URL (если задан), иначе от PB_URL.
    const base = (process.env.NEXT_PUBLIC_PB_URL || PB_URL).replace(/\/+$/, "");
    return `${base}/api/files/media/${rec.id}/${rec.file}`;
  } catch (e) {
    console.warn(`  ⚠ фото не перекачано (${e.message}): ${url}`);
    bump("фото: оставлен старый URL");
    return url;
  }
}

console.log("— Товары…");
const products = await sbAll("products");
const prodMap = new Map();
for (const p of products) {
  const existing = await findFirst("products", "slug = {:slug}", { slug: p.slug });
  if (existing) {
    prodMap.set(p.id, existing.id);
    bump("products: уже есть");
    continue;
  }
  if (DRY) { bump("products: будет создано"); continue; }

  const sourceImages = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : p.image_url ? [p.image_url] : [];
  const images = [];
  for (const u of sourceImages) images.push(await rehostImage(u));

  const rec = await pb.collection("products").create({
    slug: p.slug,
    name: p.name,
    description: p.description ?? "",
    price: Number(p.price) || 0,
    category: catMap.get(p.category_id) ?? "",
    image_url: images[0] ?? "",
    images,
    stock: p.stock ?? 0,
    seeds_per_pack: p.seeds_per_pack ?? 0,
    is_new: !!p.is_new,
    is_featured: !!p.is_featured,
    legacy_id: p.id,
  });
  prodMap.set(p.id, rec.id);
  bump("products: создано");
  process.stdout.write(`  ${p.slug}\n`);
}

// ---------- 3. Аккаунты (--with-users) ----------
const userMap = new Map(); // старый uuid -> новый id
if (WITH_USERS) {
  console.log("— Аккаунты…");
  const { data: profilesData } = await sb.from("profiles").select("*");
  const roleByUser = new Map((profilesData ?? []).map((p) => [p.id, p.role]));
  const nameByUser = new Map((profilesData ?? []).map((p) => [p.id, p.full_name ?? ""]));
  const credsLines = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("auth.listUsers: " + error.message);
    for (const u of data.users) {
      if (!u.email) continue;
      const existing = await findFirst("users", "email = {:email}", { email: u.email });
      if (existing) {
        userMap.set(u.id, existing.id);
        bump("users: уже есть");
        continue;
      }
      if (DRY) { bump("users: будет создано"); continue; }
      const password = crypto.randomBytes(12).toString("base64url");
      const rec = await pb.collection("users").create({
        email: u.email,
        password,
        passwordConfirm: password,
        name: nameByUser.get(u.id) || "",
        role: roleByUser.get(u.id) === "admin" ? "admin" : "",
        verified: true,
        emailVisibility: true,
      });
      userMap.set(u.id, rec.id);
      credsLines.push(`${u.email}\t${password}`);
      bump("users: создано");
    }
    if (data.users.length < 200) break;
  }
  if (credsLines.length) {
    const f = path.join(root, "migrate-users-passwords.txt");
    fs.writeFileSync(f, "email\tвременный пароль\n" + credsLines.join("\n") + "\n", { mode: 0o600 });
    console.log(`  Пароли перенести нельзя — новые сохранены в ${f} (передайте клиентам и удалите файл).`);
  }
}

// ---------- 4. Заказы и состав ----------
console.log("— Заказы…");
const orders = await sbAll("orders", "created_at");
const orderItems = await sbAll("order_items");
const orderMap = new Map();
for (const o of orders) {
  const existing = await findFirst("orders", "number = {:n}", { n: o.id });
  if (existing) {
    orderMap.set(o.id, { id: existing.id, existed: true });
    bump("orders: уже есть");
    continue;
  }
  if (DRY) { bump("orders: будет создано"); continue; }
  const rec = await pb.collection("orders").create({
    number: o.id,
    customer_name: o.customer_name ?? "",
    phone: o.phone ?? "",
    email: o.email ?? "",
    address: o.address ?? "",
    comment: o.comment ?? "",
    status: o.status ?? "new",
    total: Number(o.total) || 0,
    delivery_method: o.delivery_method ?? "",
    delivery_cost: Number(o.delivery_cost) || 0,
    tracking_number: o.tracking_number ?? "",
    user: userMap.get(o.user_id) ?? "",
    placed_at: o.created_at ?? new Date().toISOString(),
  });
  orderMap.set(o.id, { id: rec.id, existed: false });
  bump("orders: создано");
}

console.log("— Состав заказов…");
for (const it of orderItems) {
  const target = orderMap.get(it.order_id);
  if (!target || target.existed) { bump("order_items: пропущено"); continue; }
  if (DRY) { bump("order_items: будет создано"); continue; }
  await pb.collection("order_items").create({
    order: target.id,
    product: prodMap.get(it.product_id) ?? "",
    name: it.name ?? "",
    price: Number(it.price) || 0,
    qty: it.qty ?? 1,
  });
  bump("order_items: создано");
}

// ---------- 5. Отзывы ----------
console.log("— Отзывы…");
const reviews = await sbAll("reviews").catch(() => []);
for (const r of reviews) {
  const existing = await findFirst("reviews", "legacy_id = {:n}", { n: r.id });
  if (existing) { bump("reviews: уже есть"); continue; }
  if (DRY) { bump("reviews: будет создано"); continue; }
  await pb.collection("reviews").create({
    user: userMap.get(r.user_id) ?? "",
    order: orderMap.get(r.order_id)?.id ?? "",
    author_name: r.author_name || "Покупатель",
    rating: Math.min(5, Math.max(1, r.rating ?? 5)),
    text: r.text ?? "",
    status: r.status ?? "pending",
    source: r.source ?? "",
    published_at: r.created_at ?? new Date().toISOString(),
    legacy_id: r.id,
  });
  bump("reviews: создано");
}

// ---------- 6. Заявки в поддержку ----------
console.log("— Заявки в поддержку…");
const supports = await sbAll("support_requests").catch(() => []);
for (const r of supports) {
  const existing = await findFirst("support_requests", "legacy_id = {:n}", { n: r.id });
  if (existing) { bump("support: уже есть"); continue; }
  if (DRY) { bump("support: будет создано"); continue; }
  await pb.collection("support_requests").create({
    name: r.name ?? "",
    email: r.email ?? "",
    subject: r.subject ?? "",
    message: r.message ?? "",
    status: ["new", "processing", "done"].includes(r.status) ? r.status : "new",
    user: userMap.get(r.user_id) ?? "",
    legacy_id: r.id,
  });
  bump("support: создано");
}

// ---------- 7. Настройки сайта ----------
console.log("— Настройки сайта…");
const { data: settings } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
if (!DRY) {
  const value = settings?.vacation_until ?? "";
  const page = await pb.collection("site_settings").getList(1, 1);
  if (page.items[0]) {
    await pb.collection("site_settings").update(page.items[0].id, { vacation_until: value });
  } else {
    await pb.collection("site_settings").create({ vacation_until: value });
  }
  bump("site_settings: ok");
}

console.log(`\n===== ИТОГО${DRY ? " (пробный прогон, ничего не записано)" : ""} =====`);
for (const [k, v] of Object.entries(stats).sort()) console.log(`${k}: ${v}`);
if (!WITH_USERS) {
  console.log("\nАккаунты покупателей НЕ переносились (запустите с --with-users, если нужны).");
  console.log("Аккаунт администратора создаётся заново — см. SETUP-DB-RU.md, шаг 6.");
}
