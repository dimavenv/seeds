// Делает WebP-варианты (400/800/1200 px) для УЖЕ загруженных фото товаров.
//
//   node scripts/pb-backfill-image-variants.mjs --dry-run   # только показать
//   node scripts/pb-backfill-image-variants.mjs             # записать
//
// Параметры — из окружения или .env.production (как в остальных скриптах):
//   PB_URL (по умолчанию http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// Идемпотентен: фото, у которых варианты уже есть, пропускаются, повторный
// запуск ничего не пережимает заново. Прерванный прогон можно просто запустить
// ещё раз — продолжит с того, что осталось.
//
// Новые фото пережимаются сами при загрузке в админке (app/api/admin/media),
// этот скрипт нужен только один раз, для накопленного каталога.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { revalidateSite } from "./lib/revalidate.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
      }
    }
  } catch {
    /* файла нет — не страшно */
  }
}
loadEnvFile(path.join(root, ".env.production"));

const DRY_RUN = process.argv.includes("--dry-run");
const WIDTHS = [400, 800, 1200];
const PB_URL = (
  process.env.PB_URL ||
  process.env.PB_INTERNAL_URL ||
  "http://127.0.0.1:8090"
).replace(/\/+$/, "");
// Публичный адрес нужен для СБОРКИ ссылок на варианты: их открывает браузер
// покупателя. Если он не задан, ссылки строим от PB_URL.
const PUBLIC_URL = (
  process.env.NEXT_PUBLIC_PB_URL ||
  PB_URL
).replace(/\/+$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "Задайте PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD (в .env.production или окружении)."
  );
  process.exit(1);
}

const authRes = await fetch(
  `${PB_URL}/api/collections/_superusers/auth-with-password`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  }
);
if (!authRes.ok) {
  console.error(
    `Не удалось войти суперпользователем (${authRes.status}). Проверьте PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD и что PocketBase запущен на ${PB_URL}.`
  );
  process.exit(1);
}
const { token } = await authRes.json();
const AUTH = { Authorization: token };

// Все товары постранично.
const products = [];
for (let page = 1; ; page++) {
  const res = await fetch(
    `${PB_URL}/api/collections/products/records?page=${page}&perPage=200&fields=id,name,images,image_url,image_variants&sort=created`,
    { headers: AUTH }
  );
  if (!res.ok) {
    console.error(`Не удалось прочитать товары (${res.status}).`);
    process.exit(1);
  }
  const data = await res.json();
  products.push(...data.items);
  if (page >= data.totalPages) break;
}

// Адрес файла PocketBase → { collection, recordId, filename }. Варианты умеем
// делать только для файлов из самого PocketBase: внешнюю картинку (её можно
// вставить в админке ссылкой) мы не храним и пережимать не станем.
function parsePbFileUrl(url) {
  const m = String(url).match(
    /\/api\/files\/([^/]+)\/([^/]+)\/([^/?#]+)(?:\?|#|$)/
  );
  return m
    ? { collection: m[1], recordId: m[2], filename: decodeURIComponent(m[3]) }
    : null;
}

function existingVariants(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

let processed = 0;
let skipped = 0;
let failed = 0;
let external = 0;

for (const product of products) {
  const images = Array.isArray(product.images) ? product.images : [];
  const all = images.length ? images : product.image_url ? [product.image_url] : [];
  if (all.length === 0) continue;

  const variants = existingVariants(product.image_variants);
  let changed = false;

  for (const url of all) {
    if (typeof url !== "string" || !url) continue;
    // Уже есть все нужные ширины — не трогаем (идемпотентность).
    const have = variants[url];
    if (have && WIDTHS.every((w) => typeof have[String(w)] === "string")) {
      skipped++;
      continue;
    }

    const parsed = parsePbFileUrl(url);
    if (!parsed || parsed.collection !== "media") {
      external++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ${product.name}: ${parsed.filename} → WebP ${WIDTHS.join("/")}`);
      processed++;
      continue;
    }

    try {
      // Оригинал качаем по ВНУТРЕННЕМУ адресу — быстрее и не зависит от TLS.
      const fileRes = await fetch(
        `${PB_URL}/api/files/media/${parsed.recordId}/${encodeURIComponent(parsed.filename)}`,
        { headers: AUTH }
      );
      if (!fileRes.ok) throw new Error(`скачивание ${fileRes.status}`);
      const original = Buffer.from(await fileRes.arrayBuffer());
      const width = (await sharp(original).metadata()).width ?? 0;

      const form = new FormData();
      const base = parsed.filename.replace(/\.[^.]+$/, "") || "photo";
      const madeWidths = [];
      for (const target of WIDTHS) {
        // Не увеличиваем: вариант шире оригинала только прибавит вес.
        if (width && target > width && target !== WIDTHS[0]) continue;
        const webp = await sharp(original)
          .rotate()
          .resize({ width: target, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        form.append(
          `w${target}`,
          new Blob([webp], { type: "image/webp" }),
          `${base}-${target}.webp`
        );
        madeWidths.push(target);
      }
      if (madeWidths.length === 0) throw new Error("не собран ни один вариант");

      const patchRes = await fetch(
        `${PB_URL}/api/collections/media/records/${parsed.recordId}`,
        { method: "PATCH", headers: AUTH, body: form }
      );
      if (!patchRes.ok)
        throw new Error(`запись вариантов ${patchRes.status}: ${await patchRes.text()}`);
      const record = await patchRes.json();

      const entry = { ...(have ?? {}) };
      for (const target of madeWidths) {
        const name = record[`w${target}`];
        if (typeof name === "string" && name)
          entry[String(target)] = `${PUBLIC_URL}/api/files/media/${parsed.recordId}/${encodeURIComponent(name)}`;
      }
      variants[url] = entry;
      changed = true;
      processed++;
      console.log(`  ✓ ${product.name}: ${parsed.filename} → ${madeWidths.join("/")}px`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${product.name}: ${parsed.filename} — ${e.message}`);
    }
  }

  if (changed && !DRY_RUN) {
    const res = await fetch(
      `${PB_URL}/api/collections/products/records/${product.id}`,
      {
        method: "PATCH",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ image_variants: variants }),
      }
    );
    if (!res.ok) {
      failed++;
      console.error(`  ✗ ${product.name}: не сохранены ссылки — ${await res.text()}`);
    }
  }
}

console.log(
  `\nТоваров: ${products.length}. Обработано фото: ${processed}. ` +
    `Уже были варианты: ${skipped}. Внешних ссылок (пропущены): ${external}. Ошибок: ${failed}.`
);
if (DRY_RUN) console.log("Пробный прогон: в базу ничего не записано.");
else if (processed > 0) await revalidateSite();
process.exit(failed > 0 ? 1 : 0);
