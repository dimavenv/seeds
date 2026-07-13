// Создать администратора магазина (или выдать роль admin существующему).
//
//   node scripts/pb-make-admin.mjs you@example.com 'ВАШ_ПАРОЛЬ'
//
// Если аккаунта нет — создаётся с ролью admin (сразу подтверждён).
// Если есть — ему проставляется role=admin и, если пароль указан, меняется.
// Параметры PocketBase берутся из .env.production (PB_INTERNAL_URL, PB_ADMIN_*).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const [, , email, password] = process.argv;
if (!email) {
  console.error("Использование: node scripts/pb-make-admin.mjs <email> [пароль]");
  process.exit(1);
}

const PB_URL = (process.env.PB_INTERNAL_URL || process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/+$/, "");
if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
  console.error("Задайте PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD в .env.production.");
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD
);

let existing = null;
try {
  existing = await pb.collection("users").getFirstListItem(pb.filter("email = {:e}", { e: email }));
} catch {
  existing = null;
}

if (existing) {
  const patch = { role: "admin" };
  if (password) {
    patch.password = password;
    patch.passwordConfirm = password;
  }
  await pb.collection("users").update(existing.id, patch);
  console.log(`Готово: у аккаунта ${email} теперь роль admin${password ? " (пароль обновлён)" : ""}.`);
  console.log("Войдите заново на /login, чтобы роль попала в новую сессию.");
} else {
  if (!password) {
    console.error("Аккаунта нет — укажите пароль вторым аргументом, чтобы создать его.");
    process.exit(1);
  }
  await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "Администратор",
    role: "admin",
    verified: true,
    emailVisibility: true,
  });
  console.log(`Готово: создан администратор ${email}. Войдите на /login.`);
}
