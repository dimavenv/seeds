// Скачивает бинарник PocketBase в .pb/ для интеграционных тестов
// (tests/stock-race.test.ts — гонка списания остатков против живой базы).
//
//   node scripts/fetch-pocketbase.mjs   (или npm run pb:fetch)
//
// Бинарник берётся из npm-пакетов pocketbase-server-* (зеркала официальных
// релизов) и НЕ попадает ни в git, ни в прод-зависимости. Без него
// интеграционные тесты просто пропускаются.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.36.9"; // держать в ногу с PocketBase на сервере

const PKGS = {
  "linux-x64": "pocketbase-server-linux-x64",
  "linux-arm64": "pocketbase-server-linux-arm64",
  "darwin-arm64": "pocketbase-server-darwin-arm64",
  "darwin-x64": "pocketbase-server-darwin-x64",
  "win32-x64": "pocketbase-server-win32-x64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PKGS[key];
if (!pkg) {
  console.error(`Нет пакета с бинарником PocketBase для платформы ${key}.`);
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefix = path.join(root, ".pb");
const binName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
const binPath = path.join(prefix, "node_modules", pkg, "bin", binName);

if (fs.existsSync(binPath)) {
  console.log(`PocketBase уже на месте: ${binPath}`);
  process.exit(0);
}

console.log(`Скачиваю ${pkg}@${VERSION} в .pb/ …`);
execSync(`npm install --prefix "${prefix}" --no-save --no-audit --no-fund ${pkg}@${VERSION}`, {
  stdio: "inherit",
});
if (!fs.existsSync(binPath)) {
  console.error("Пакет установился, но бинарник не найден:", binPath);
  process.exit(1);
}
fs.chmodSync(binPath, 0o755);
console.log(`Готово: ${binPath}`);
console.log("Теперь npm test прогонит и интеграционные тесты гонки остатков.");
