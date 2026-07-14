// Проверка отправки почты (SMTP) с этого сервера.
//
//   node scripts/check-mail.mjs адрес@куда-послать.ru
//
// Читает SMTP_* из .env.production и шлёт тестовое письмо тем же способом,
// что и сайт. Печатает либо «отправлено», либо точную причину ошибки.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
  return env;
}
// Файл главнее переменных шелла (как у сайта под pm2).
for (const [k, v] of Object.entries(readEnvFile(path.join(root, ".env.production")))) {
  process.env[k] = v;
}

const to = process.argv[2];
if (!to) {
  console.error("Использование: node scripts/check-mail.mjs адрес@почта.ru");
  process.exit(1);
}

const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 465);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASSWORD || "";

console.log("SMTP_HOST:", host || "— не задан");
console.log("SMTP_PORT:", port);
console.log("SMTP_USER:", user || "— не задан");
console.log("SMTP_PASSWORD:", pass ? "задан" : "— не задан");
console.log("MAIL_FROM:", process.env.MAIL_FROM || `(по умолчанию: ${user})`);
console.log();

if (!host || !user || !pass) {
  console.error("❌ Заполните SMTP_HOST, SMTP_USER и SMTP_PASSWORD в .env.production (см. SETUP-MAIL-RU.md).");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  connectionTimeout: 8000,
  socketTimeout: 15000,
});

try {
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || `"Томат Семена" <${user}>`,
    to,
    subject: "Проверка почты — Томат Семена",
    html: "<p>Это тестовое письмо с сервера tomatsemena.ru. Если вы его видите — SMTP настроен правильно ✅</p>",
  });
  console.log(`✅ Отправлено (${info.response ?? "ok"}). Проверьте входящие (и «Спам») на ${to}.`);
  console.log("Если письмо в спаме — настройте SPF/DKIM у почтового провайдера (SETUP-MAIL-RU.md).");
} catch (e) {
  const msg = e?.message || String(e);
  console.error(`❌ Не отправилось: ${msg}`);
  if (/auth|535|Invalid login|credentials/i.test(msg)) {
    console.error(`
Похоже, логин/пароль не подходят:
  • для Яндекса и Mail.ru нужен «пароль приложения», а не пароль от почты
    (создаётся в настройках безопасности ящика);
  • у Яндекса включите «Разрешить доступ по протоколу IMAP/SMTP» в настройках.`);
  } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout/i.test(msg)) {
    console.error(`
Похоже, сервер недоступен:
  • проверьте SMTP_HOST/SMTP_PORT (Яндекс: smtp.yandex.ru:465, Mail.ru: smtp.mail.ru:465);
  • некоторые VPS-провайдеры блокируют исходящий порт 25 — используйте 465.`);
  } else if (/certificate|TLS|SSL/i.test(msg)) {
    console.error("\nПроблема с TLS-сертификатом — проверьте, что SMTP_PORT=465 для SSL-подключения.");
  }
  process.exit(1);
}
