// Импорт товаров с Ozon в Supabase (названия, цены, описания и ВСЕ фото).
//
// Запуск:
//   npm run import:ozon -- --dry          # тест без записи (только показать, что найдено)
//   npm run import:ozon                    # реальный импорт
//   npm run import:ozon -- --limit=20      # только первые 20 (для пробы)
//   npm run import:ozon -- --images=8      # максимум фото на товар (по умолч. 6)
//   npm run import:ozon -- --no-desc       # без описаний (быстрее)
//   npm run import:ozon -- --skip-existing # пропускать уже импортированные (резюме)
//
// Нужны переменные окружения (в .env.local):
//   OZON_CLIENT_ID, OZON_API_KEY            — ключи продавца Ozon (ЛК → Настройки → Seller API)
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — как для сайта
//
// Перед запуском применить миграции (в т.ч. 0004_product_images.sql) и иметь
// bucket "product-images" в Supabase Storage.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- 0. Загрузка .env.local (без сторонних зависимостей) ----------
function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// ---------- 1. Аргументы ----------
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const num = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split("=")[1]) : def;
};
const DRY = has("--dry");
const NO_DESC = has("--no-desc");
const SKIP_EXISTING = has("--skip-existing");
const LIMIT = num("limit", 0); // 0 = все
const MAX_IMAGES = num("images", 6);
const DEFAULT_STOCK = num("stock", 100);

// ---------- 2. Проверка переменных ----------
const {
  OZON_CLIENT_ID,
  OZON_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

function die(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

if (!OZON_CLIENT_ID || !OZON_API_KEY)
  die("Нет OZON_CLIENT_ID / OZON_API_KEY в .env.local (ЛК Ozon → Настройки → Seller API).");
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
  die("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env.local.");

const supabase = createClient(
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ---------- 3. Хелпер Ozon Seller API ----------
const OZON_BASE = "https://api-seller.ozon.ru";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch с таймаутом (иначе зависшее соединение остановит весь импорт молча).
async function fetchT(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Обернуть любой промис таймаутом (для зависающих вызовов Storage).
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`таймаут ${label} (${ms}мс)`)), ms)
    ),
  ]);
}

async function ozon(path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetchT(
        OZON_BASE + path,
        {
          method: "POST",
          headers: {
            "Client-Id": OZON_CLIENT_ID,
            "Api-Key": OZON_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body ?? {}),
        },
        30000
      );
    } catch (e) {
      // таймаут/сетевая ошибка — повторяем
      if (attempt < 3) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Ozon ${path}: сеть/таймаут — ${e.message}`);
    }
    if (res.status === 429) {
      // превышен лимит — ждём и повторяем
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ozon ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error(`Ozon ${path}: слишком много 429 (лимит запросов)`);
}

// ---------- 4. Категория по названию ----------
const CATEGORY_RULES = [
  ["tomaty", ["томат", "помидор", "черри", "tomat"]],
  ["perec-chili", ["чили", "острый перец", "перец острый", "халапен", "хабанеро", "jalap", "chili", "жгуч"]],
  ["perec-sladkiy", ["перец", "сладк", "болгарск", "паприка", "pepper"]],
  ["baklazhany", ["баклажан", "eggplant"]],
  ["kukuruza", ["кукуруз", "corn"]],
  ["kartofel", ["картоф", "картошк", "potato"]],
  ["dynya", ["дын", "канталуп", "melon"]],
  ["arbuz", ["арбуз", "watermelon"]],
];

function detectCategorySlug(name) {
  const n = (name || "").toLowerCase();
  for (const [slug, words] of CATEGORY_RULES) {
    if (words.some((w) => n.includes(w))) return slug;
  }
  return null;
}

// ---------- 5. Утилиты ----------
function slugifyOffer(offerId, productId) {
  const base = String(offerId || productId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `ozon-${base || productId}`;
}

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000) || null;
}

function normalizeImages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((img) =>
      typeof img === "string" ? img : img?.file_name || img?.url || img?.default
    )
    .filter((u) => typeof u === "string" && u.startsWith("http"));
}

// ---------- 6. Загрузка одной картинки в Supabase Storage ----------
// Заливаем напрямую через Storage REST API телом-Buffer: это надёжнее, чем
// storage-клиент supabase-js, который в Node может зависать на Blob/стриме.
const BUCKET = "product-images";
async function uploadImage(url, offerId, index) {
  const res = await fetchT(url, {}, 25000); // скачивание фото с CDN Ozon
  if (!res.ok) throw new Error(`скачивание ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "image/jpeg";
  const ext = (url.split("?")[0].split(".").pop() || "jpg").slice(0, 5);
  const safeOffer = String(offerId).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  const path = `ozon/${safeOffer}/${index}.${ext}`;

  const endpoint = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const up = await fetchT(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": ct,
        "x-upsert": "true",
      },
      body,
    },
    45000
  );
  if (!up.ok) {
    const t = await up.text();
    throw new Error(`upload ${up.status}: ${t.slice(0, 200)}`);
  }
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ---------- 7. Основной процесс ----------
async function main() {
  console.log(
    `\n🚚 Импорт с Ozon${DRY ? " (DRY-RUN, без записи)" : ""}` +
      `  фото≤${MAX_IMAGES}${NO_DESC ? ", без описаний" : ""}` +
      `${LIMIT ? `, лимит ${LIMIT}` : ""}\n`
  );

  // 7.1 Карта категорий slug → id
  const catMap = {};
  if (!DRY) {
    const { data: cats, error } = await supabase
      .from("categories")
      .select("id, slug");
    if (error) die("Не удалось прочитать категории: " + error.message);
    for (const c of cats) catMap[c.slug] = c.id;
  }

  // 7.2 Собрать список всех товаров (product_id + offer_id)
  let lastId = "";
  const list = [];
  while (true) {
    const data = await ozon("/v3/product/list", {
      filter: { visibility: "ALL" },
      last_id: lastId,
      limit: 1000,
    });
    const r = data.result ?? data;
    const items = r.items ?? [];
    list.push(...items);
    lastId = r.last_id ?? "";
    process.stdout.write(`\rНайдено товаров: ${list.length}`);
    if (!items.length || !lastId) break;
    if (LIMIT && list.length >= LIMIT) break;
  }
  const productList = LIMIT ? list.slice(0, LIMIT) : list;
  console.log(`\nВсего к импорту: ${productList.length}\n`);

  // 7.3 Идём батчами по 100: подробности + фото + описание
  let ok = 0,
    skipped = 0,
    failed = 0,
    processed = 0;
  const total = productList.length;
  const BATCH = 100;

  for (let i = 0; i < productList.length; i += BATCH) {
    const batch = productList.slice(i, i + BATCH);
    const productIds = batch.map((p) => p.product_id).filter(Boolean);

    let info;
    try {
      info = await ozon("/v3/product/info/list", { product_id: productIds });
    } catch (e) {
      console.error(`\nБатч ${i}: ошибка info/list — ${e.message}`);
      failed += batch.length;
      continue;
    }
    const infoItems = info.items ?? info.result?.items ?? [];
    console.log(`Батч ${i / BATCH + 1}: получено ${infoItems.length} товаров, обрабатываю…`);

    for (const item of infoItems) {
      const offerId = item.offer_id ?? item.id;
      const name = (item.name || "").trim();
      if (!name) {
        failed++;
        continue;
      }
      processed++;
      const slug = slugifyOffer(offerId, item.id);

      try {
        // пропуск уже импортированных
        if (SKIP_EXISTING && !DRY) {
          const { data: ex } = await supabase
            .from("products")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();
          if (ex) {
            skipped++;
            console.log(`  ↷ пропуск (есть): ${name}`);
            continue;
          }
        }

        const price = Number(item.price ?? item.marketing_price ?? 0) || 0;
        const categorySlug = detectCategorySlug(name);

        // картинки
        let srcImages = normalizeImages(item.images);
        if (item.primary_image && typeof item.primary_image === "string") {
          srcImages = [item.primary_image, ...srcImages.filter((u) => u !== item.primary_image)];
        }
        // если в info/list фото не пришли — добираем из /v2/product/info
        if (srcImages.length === 0) {
          try {
            const v2 = await ozon("/v2/product/info", { product_id: item.id });
            const r2 = v2.result ?? v2;
            srcImages = normalizeImages(r2.images);
            if (r2.primary_image) srcImages.unshift(r2.primary_image);
          } catch {
            /* без фото */
          }
        }
        srcImages = [...new Set(srcImages)].slice(0, MAX_IMAGES);

        // описание
        let description = null;
        if (!NO_DESC) {
          try {
            const d = await ozon("/v1/product/info/description", {
              product_id: item.id,
            });
            description = stripHtml((d.result ?? d).description);
          } catch {
            /* без описания */
          }
        }

        if (DRY) {
          console.log(
            `  • ${name} — ${price}₽ — ${srcImages.length} фото — кат: ${categorySlug ?? "—"}`
          );
          ok++;
          continue;
        }

        // загрузка фото в наше хранилище
        process.stdout.write(
          `[${processed}/${total}] ${name.slice(0, 60)} — ${srcImages.length} фото… `
        );
        const uploaded = [];
        for (let k = 0; k < srcImages.length; k++) {
          try {
            uploaded.push(await uploadImage(srcImages[k], offerId, k));
          } catch (e) {
            console.warn(`\n    фото ${k} не загрузилось: ${e.message}`);
          }
        }

        const row = {
          slug,
          name,
          description,
          price,
          category_id: categorySlug ? catMap[categorySlug] ?? null : null,
          image_url: uploaded[0] ?? null,
          images: uploaded,
          stock: DEFAULT_STOCK,
          is_new: false,
          is_featured: false,
        };

        const { error } = await withTimeout(
          supabase.from("products").upsert(row, { onConflict: "slug" }),
          30000,
          "запись товара"
        );
        if (error) throw new Error(error.message);

        ok++;
        console.log(`✓ ${uploaded.length} фото, ${categorySlug ?? "без категории"}`);
      } catch (e) {
        failed++;
        console.log(`✗ ${e.message}`);
      }

      await sleep(120); // бережём лимиты Ozon
    }
  }

  console.log(
    `\n✅ Готово. Импортировано: ${ok}, пропущено: ${skipped}, ошибок: ${failed}.`
  );
  if (DRY) console.log("Это был DRY-RUN — ничего не записано. Уберите --dry для реального импорта.");
}

main().catch((e) => die(e.message));
