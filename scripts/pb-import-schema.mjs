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

// ===== Вход через Яндекс ID: настройки OAuth2 нельзя терять при импорте =====
// Ключи приложения живут в PocketBase (в pb_schema.json их, разумеется, нет), а
// импорт перезаписывает коллекцию целиком — вместе с блоком oauth2. Поэтому:
// читаем текущую настройку ДО импорта и возвращаем её ПОСЛЕ. Если в
// .env.production заданы YANDEX_CLIENT_ID/YANDEX_CLIENT_SECRET, они выигрывают —
// так провайдер настраивается одной командой, без админки.
async function readUsersOAuth2() {
  try {
    const res = await fetch(`${PB_URL}/api/collections/users`, {
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const col = await res.json();
    return col.oauth2 ?? null;
  } catch {
    return null;
  }
}

const savedOAuth2 = await readUsersOAuth2();

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

// Возвращаем (или задаём) настройку входа через Яндекс ID.
{
  const id = (process.env.YANDEX_CLIENT_ID || "").trim();
  const secret = (process.env.YANDEX_CLIENT_SECRET || "").trim();
  let oauth2 = null;

  if (id && secret) {
    // Прочие провайдеры (если их настраивали в админке) сохраняем как есть.
    const others = (savedOAuth2?.providers ?? []).filter((p) => p.name !== "yandex");
    oauth2 = {
      enabled: true,
      providers: [...others, { name: "yandex", clientId: id, clientSecret: secret }],
    };
  } else if (savedOAuth2?.providers?.length) {
    oauth2 = savedOAuth2; // ключей в .env нет — просто не теряем настроенное
  }

  if (oauth2) {
    const res = await fetch(`${PB_URL}/api/collections/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ oauth2 }),
    });
    if (res.ok) {
      const names = oauth2.providers.map((p) => p.name).join(", ");
      console.log(`Вход через внешние сервисы: ${names}`);
    } else {
      console.error(
        "Не удалось сохранить настройки OAuth2:",
        res.status,
        await res.text()
      );
      console.error(
        "Задайте провайдера вручную: админка PocketBase → Collections → users → Options → OAuth2."
      );
    }
  } else if (!id && !secret) {
    console.log(
      "Вход через Яндекс ID не настроен (нет YANDEX_CLIENT_ID/YANDEX_CLIENT_SECRET) — кнопки на сайте не будет."
    );
  }
}

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
