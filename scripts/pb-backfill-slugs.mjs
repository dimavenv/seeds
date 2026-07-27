// Проставляет слаги товарам, у которых поле slug пустое.
//
//   node scripts/pb-backfill-slugs.mjs --dry-run   # только показать, что будет
//   node scripts/pb-backfill-slugs.mjs             # записать в базу
//
// Параметры берутся из окружения или из .env.production (как в
// scripts/pb-import-schema.mjs):
//   PB_URL (по умолчанию http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// Скрипт идемпотентен: товары с уже заполненным slug не трогаются, повторный
// запуск ничего не меняет. Существующие слаги НЕ переписываются даже если
// название сорта поменялось — смена адреса проиндексированной страницы стоит
// дороже, чем красивый URL.
//
// Правила транслитерации продублированы из lib/slug.ts: .mjs-скрипт
// запускается голым Node, без сборщика, и импортировать TypeScript не может.
// При правке таблицы меняйте оба файла.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const PB_URL = (
  process.env.PB_URL ||
  process.env.PB_INTERNAL_URL ||
  "http://127.0.0.1:8090"
).replace(/\/+$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "Задайте PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD (в .env.production или окружении)."
  );
  process.exit(1);
}

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

function slugify(input) {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
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

// Забираем все товары постранично: getFullList в REST нет, но 500 на страницу
// хватает с запасом.
const products = [];
for (let page = 1; ; page++) {
  const res = await fetch(
    `${PB_URL}/api/collections/products/records?page=${page}&perPage=500&fields=id,name,slug&sort=created`,
    { headers: { Authorization: token } }
  );
  if (!res.ok) {
    console.error(`Не удалось прочитать товары (${res.status}).`);
    process.exit(1);
  }
  const data = await res.json();
  products.push(...data.items);
  if (page >= data.totalPages) break;
}

// Слаг обязан быть уникальным: два сорта с похожими названиями
// («Бычье сердце» и «Бычье сердце!») дали бы один и тот же адрес. Занятые
// слаги собираем заранее и при столкновении добавляем -2, -3, …
const taken = new Set(products.map((p) => p.slug).filter(Boolean));

function uniqueSlug(base) {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  taken.add(candidate);
  return candidate;
}

const todo = products.filter((p) => !p.slug);
console.log(
  `Всего товаров: ${products.length}. Без слага: ${todo.length}.${DRY_RUN ? " (пробный прогон)" : ""}`
);

let done = 0;
let failed = 0;
for (const product of todo) {
  const base = slugify(product.name || "") || `tovar-${product.id}`;
  const slug = uniqueSlug(base);
  if (DRY_RUN) {
    console.log(`  ${product.name} → /product/${slug}`);
    continue;
  }
  const res = await fetch(
    `${PB_URL}/api/collections/products/records/${product.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ slug }),
    }
  );
  if (res.ok) {
    done++;
    console.log(`  ✓ ${product.name} → /product/${slug}`);
  } else {
    failed++;
    console.error(`  ✗ ${product.name} (${res.status}): ${await res.text()}`);
  }
}

if (DRY_RUN) {
  console.log("Пробный прогон: в базу ничего не записано.");
} else {
  console.log(`Готово. Обновлено: ${done}. Ошибок: ${failed}.`);
  if (done > 0) {
    console.log(
      "Карта сайта пересоберётся сама в течение часа (ISR), либо перезапустите сайт."
    );
  }
}
process.exit(failed > 0 ? 1 : 0);
