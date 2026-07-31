// Переименовывает категории в единственное число: «Томаты» → «Томат»,
// «Баклажаны» → «Баклажан».
//
//   node scripts/pb-categories-singular.mjs --dry-run   # только показать
//   node scripts/pb-categories-singular.mjs             # записать в базу
//   npm run db:categories                               # то же самое
//
// Параметры берутся из окружения или из .env.production (как в остальных
// скриптах):
//   PB_URL (по умолчанию http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// Меняется ТОЛЬКО название (name) — слаг (адрес /catalog/tomaty) остаётся
// прежним: смена адреса проиндексированной страницы стоит дороже, чем
// единообразие в URL. Скрипт идемпотентен: категория, уже названная в
// единственном числе, не трогается, повторный запуск ничего не меняет.
//
// Названия сопоставляются по СЛАГУ, а не по тексту: так переименование не
// зависит от того, как категорию назвали в админке («Томаты», «ТОМАТЫ»,
// «Томаты 🍅»). Завели новую категорию во множественном числе — допишите её
// слаг в SINGULAR ниже.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// Слаг категории → название в единственном числе.
// Тот же список продублирован в lib/demo-data.ts (демо-каталог без базы) —
// при правке меняйте оба места.
const SINGULAR = {
  tomaty: "Томат",
  baklazhany: "Баклажан",
  "perec-sladkiy": "Перец сладкий",
  "perec-chili": "Перец чили",
  kukuruza: "Кукуруза",
  kartofel: "Картофель",
  dynya: "Дыня",
  arbuz: "Арбуз",
};

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

const listRes = await fetch(
  `${PB_URL}/api/collections/categories/records?perPage=500&fields=id,slug,name&sort=sort_order`,
  { headers: { Authorization: token } }
);
if (!listRes.ok) {
  console.error(`Не удалось прочитать категории (${listRes.status}).`);
  process.exit(1);
}
const { items: categories } = await listRes.json();

const todo = categories.filter(
  (c) => SINGULAR[c.slug] && SINGULAR[c.slug] !== c.name
);
const unknown = categories.filter((c) => !SINGULAR[c.slug]);

console.log(
  `Категорий: ${categories.length}. Переименовать: ${todo.length}.${
    DRY_RUN ? " (пробный прогон)" : ""
  }`
);

let done = 0;
let failed = 0;
for (const cat of todo) {
  const name = SINGULAR[cat.slug];
  if (DRY_RUN) {
    console.log(`  ${cat.name} → ${name}`);
    continue;
  }
  const res = await fetch(
    `${PB_URL}/api/collections/categories/records/${cat.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ name }),
    }
  );
  if (res.ok) {
    done++;
    console.log(`  ✓ ${cat.name} → ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${cat.name} (${res.status}): ${await res.text()}`);
  }
}

if (unknown.length > 0) {
  console.log(
    `\nНе в списке (оставлены как есть): ${unknown
      .map((c) => `${c.name} (${c.slug})`)
      .join(", ")}.\n` +
      "Если такую категорию тоже нужно в единственном числе — допишите её слаг\n" +
      "в SINGULAR в этом файле и в lib/demo-data.ts, потом запустите ещё раз."
  );
}

if (DRY_RUN) {
  console.log("\nПробный прогон: в базу ничего не записано.");
} else {
  console.log(`\nГотово. Переименовано: ${done}. Ошибок: ${failed}.`);
  // Названия категорий висят в кэше каталога и в карте сайта — сбрасываем.
  if (done > 0) await revalidateSite();
}
process.exit(failed > 0 ? 1 : 0);
