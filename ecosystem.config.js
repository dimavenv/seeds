// Конфиг pm2 для запуска магазина на VPS (см. SETUP-VPS-RU.md).
//
// ВАЖНО: standalone-сервер Next.js сам НЕ читает .env-файлы, поэтому
// переменные из .env.production загружаем здесь и передаём процессу.
// NEXT_PUBLIC_* при этом должны быть заданы ещё и на момент `npm run build` —
// сборка сама читает .env.production из корня проекта.
const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, file), "utf8").split("\n")) {
      // (.*?) — лениво, чтобы \s*$ отрезал хвостовые пробелы и \r (CRLF):
      // иначе невидимый символ попадает в значение (например, в пароль банка).
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        // Кавычки снимаем только ПАРОЙ (значение целиком обёрнуто в них) —
        // одиночная кавычка в начале/конце пароля остаётся его частью.
        env[m[1]] = m[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
      }
    }
  } catch {
    // файла нет — запустимся без него (демо-режим)
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "seeds",
      script: ".next/standalone/server.js",
      exec_mode: "cluster",
      instances: 2,
      max_memory_restart: "512M",
      // Если воркеры падают с «Failed to start server» без подробностей —
      // почти всегда порт 3000 уже занят другим процессом. Проверить:
      //   pgrep -a next-server   (процесс Next называется next-server, не node)
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
        ...loadEnv(".env.production"),
      },
    },
  ],
};
