// Убирает приставку «ozon-» из начала артикула (поля slug) у товаров.
//
//   node scripts/pb-strip-slug-prefix.mjs --dry-run   # только показать
//   node scripts/pb-strip-slug-prefix.mjs             # записать в базу
//
// Параметры — из окружения или .env.production (как в остальных скриптах):
//   PB_URL (по умолчанию http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// ВАЖНО, ПРОЧТИТЕ ДО ЗАПУСКА. Артикул — это одновременно адрес карточки
// товара: /product/<артикул>. Переименование меняет адрес каждого затронутого
// товара, и все старые ссылки (в поиске, на Ozon, в переписке) стали бы
// битыми. Поэтому вместе со скриптом в код добавлен постоянный редирект:
// /product/ozon-<что-то> уводит на /product/<что-то> кодом 308 (постоянный
// редирект; и Яндекс, и Google трактуют его так же, как 301)
// (см. redirectLegacyUrl в app/product/[slug]/page.tsx). Старые ссылки
// продолжат работать и передадут накопленный вес новым адресам.
//
// Скрипт идемпотентен: товары без приставки пропускаются, повторный запуск
// ничего не меняет.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { revalidateSite } from "./lib/revalidate.mjs";

const PREFIX = "ozon-";
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
    `${PB_URL}/api/collections/products/records?page=${page}&perPage=500&fields=id,name,slug&sort=created`,
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

// Индекс уже занятых артикулов: у slug в схеме уникальный индекс, и если после
// снятия приставки получится дубль, запись просто не сохранится. Такие случаи
// разводим суффиксом -2, -3 — и показываем в отчёте отдельно.
const taken = new Set(products.map((p) => p.slug).filter(Boolean));

const targets = products.filter(
  (p) => typeof p.slug === "string" && p.slug.startsWith(PREFIX)
);
console.log(
  `Всего товаров: ${products.length}. С приставкой «${PREFIX}»: ${targets.length}.` +
    (DRY_RUN ? " (пробный прогон)" : "")
);
if (targets.length === 0) {
  console.log("Менять нечего — приставки нет ни у одного товара.");
  process.exit(0);
}

let done = 0;
let failed = 0;
const collisions = [];

for (const product of targets) {
  const base = product.slug.slice(PREFIX.length);
  if (!base) {
    failed++;
    console.error(`  ✗ ${product.name}: артикул состоит только из приставки`);
    continue;
  }

  let slug = base;
  if (taken.has(slug)) {
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    collisions.push(`${product.slug} → ${slug} (адрес ${base} уже занят)`);
  }

  if (DRY_RUN) {
    console.log(`  /product/${product.slug} → /product/${slug}`);
    taken.add(slug);
    done++;
    continue;
  }

  const res = await fetch(
    `${PB_URL}/api/collections/products/records/${product.id}`,
    {
      method: "PATCH",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    }
  );
  if (res.ok) {
    taken.delete(product.slug);
    taken.add(slug);
    done++;
    console.log(`  ✓ ${product.name}: /product/${product.slug} → /product/${slug}`);
  } else {
    failed++;
    console.error(`  ✗ ${product.name} (${res.status}): ${await res.text()}`);
  }
}

console.log(`\nГотово. Изменено: ${done}. Ошибок: ${failed}.`);
if (collisions.length > 0) {
  console.log(
    `\nВНИМАНИЕ: ${collisions.length} артикул(ов) совпали с уже существующими ` +
      `и получили числовой суффикс:`
  );
  for (const c of collisions) console.log(`  ${c}`);
  console.log("Проверьте их — возможно, это задвоенные товары.");
}
if (DRY_RUN) {
  console.log("Пробный прогон: в базу ничего не записано.");
} else if (done > 0) {
  console.log(
    "\nСтарые адреса /product/ozon-… продолжат работать: сайт отдаёт с них\n" +
      "постоянный редирект на новый адрес."
  );
  // Адреса товаров изменились — карту сайта надо пересобрать немедленно,
  // иначе поисковик ещё до часа читал бы старые ссылки.
  await revalidateSite();
  console.log(
    "В Вебмастере и Search Console карту сайта можно отправить заново,\n" +
      "чтобы новые адреса переобошли быстрее."
  );
}
process.exit(failed > 0 ? 1 : 0);
