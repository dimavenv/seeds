// Импорт схемы коллекций в PocketBase из pocketbase/pb_schema.json.
// Запускать после установки PocketBase и создания суперпользователя:
//
//   node scripts/pb-import-schema.mjs
//
// Параметры берутся из переменных окружения или из .env.production:
//   PB_URL (по умолчанию http://127.0.0.1:8090), PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
//
// Скрипт идемпотентен: повторный запуск обновляет коллекции до состояния файла
// (существующие ДАННЫЕ не трогаются; deleteMissing не используется).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Простая загрузка .env.production (без сторонних пакетов).
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) {
        // Кавычки снимаем только парой — одиночная остаётся частью значения.
        process.env[m[1]] = m[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
      }
    }
  } catch {
    /* файла нет — не страшно */
  }
}
loadEnvFile(path.join(root, ".env.production"));

const PB_URL = (process.env.PB_URL || process.env.PB_INTERNAL_URL || "http://127.0.0.1:8090").replace(/\/+$/, "");
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Задайте PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD (в .env.production или окружении).");
  process.exit(1);
}

const schema = JSON.parse(
  fs.readFileSync(path.join(root, "pocketbase", "pb_schema.json"), "utf8")
);

const authRes = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
});
if (!authRes.ok) {
  console.error(`Не удалось войти суперпользователем (${authRes.status}). Проверьте PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD и что PocketBase запущен на ${PB_URL}.`);
  process.exit(1);
}
const { token } = await authRes.json();

const importRes = await fetch(`${PB_URL}/api/collections/import`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify({ collections: schema, deleteMissing: false }),
});
if (!importRes.ok) {
  console.error("Импорт не удался:", importRes.status, await importRes.text());
  process.exit(1);
}
console.log(`Схема импортирована: ${schema.map((c) => c.name).join(", ")}`);

// Batch API нужен для атомарного списания остатков при оформлении заказа
// (lib/stock.ts): несколько обновлений выполняются одной транзакцией, и
// попытка увести stock ниже нуля откатывает её целиком. Без включённого
// Batch API сайт продолжает работать, но списание неатомарное (старый путь).
const settingsRes = await fetch(`${PB_URL}/api/settings`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify({
    batch: { enabled: true, maxRequests: 200, timeout: 10, maxBodySize: 0 },
  }),
});
if (settingsRes.ok) {
  console.log("Batch API включён (атомарное списание остатков).");
} else {
  console.error(
    "Не удалось включить Batch API:",
    settingsRes.status,
    await settingsRes.text()
  );
  console.error("Включите вручную: админка PocketBase → Settings → Application → Batch API.");
}
console.log("Готово. Откройте админку PocketBase и убедитесь, что коллекции на месте.");
