// Самодиагностика оплаты через Robokassa с этого сервера.
//
//   node scripts/check-robokassa.mjs
//
// Что делает:
//   1. читает ROBOKASSA_* из .env.production и показывает, что именно увидит сайт;
//   2. проверяет связь с Robokassa и пару «логин + Пароль#2» через XML-интерфейс
//      OpStateExt (запрос состояния несуществующего счёта: подпись должна быть
//      принята, а сам счёт — не найден);
//   3. печатает готовую ссылку на тестовый платёж на 1 ₽, подписанную Паролем#1 —
//      по ней видно, принимает ли Robokassa подпись исходящих запросов.
// Ничего не списывает: платёж по ссылке открывать не обязательно.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Ключи, у которых в конце строки нашлись невидимые символы (пробел/CR) —
// они попадают прямо в значение, и подпись перестаёт сходиться.
const dirtyKeys = [];

function readEnvFile(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      // (.*?) — лениво, чтобы \s*$ отрезал хвостовые пробелы и \r (CRLF).
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        // Кавычки снимаем только парой — одиночная остаётся частью значения.
        env[m[1]] = m[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
        if (/[ \t\r]$/.test(line) && m[2] !== "") dirtyKeys.push(m[1]);
      }
    }
  } catch {}
  return env;
}

// Значения из .env.production главнее унаследованных из шелла — сайт (pm2)
// работает именно по файлу.
const fileEnv = readEnvFile(path.join(root, ".env.production"));
for (const [k, v] of Object.entries(fileEnv)) {
  if (k in process.env && process.env[k] !== v) {
    console.warn(
      `⚠️  ${k}: в SSH-сессии осталось старое значение, в .env.production — новое. ` +
        `Использую файл (как и сайт).`
    );
  }
  process.env[k] = v;
}

const login = (process.env.ROBOKASSA_LOGIN || "").trim();
const isTest = ["1", "true", "on", "yes"].includes(
  (process.env.ROBOKASSA_TEST || "").trim().toLowerCase()
);
const pass1 =
  (isTest && (process.env.ROBOKASSA_TEST_PASSWORD1 || "").trim()) ||
  (process.env.ROBOKASSA_PASSWORD1 || "").trim();
const pass2 =
  (isTest && (process.env.ROBOKASSA_TEST_PASSWORD2 || "").trim()) ||
  (process.env.ROBOKASSA_PASSWORD2 || "").trim();

const ALGOS = ["md5", "sha1", "sha256", "sha384", "sha512", "ripemd160"];
const algoRaw = (process.env.ROBOKASSA_HASH || "")
  .toLowerCase()
  .replace(/[-_\s]/g, "");
const algo = ALGOS.includes(algoRaw) ? algoRaw : "md5";

const hash = (data) =>
  crypto.createHash(algo).update(data, "utf8").digest("hex").toUpperCase();

console.log("Магазин (ROBOKASSA_LOGIN):", login || "— не задан");
console.log("Пароль#1:                 ", pass1 ? "задан" : "— не задан");
console.log("Пароль#2:                 ", pass2 ? "задан" : "— не задан");
console.log("Алгоритм хеша:            ", algo, algoRaw && !ALGOS.includes(algoRaw) ? "(ROBOKASSA_HASH не распознан — взят md5)" : "");
console.log("Тестовый режим:           ", isTest ? "ДА (IsTest=1)" : "нет");
console.log(
  "Фискальный чек:           ",
  ["1", "true", "on", "yes"].includes(
    (process.env.ROBOKASSA_RECEIPT || "").trim().toLowerCase()
  )
    ? `да (sno=${process.env.ROBOKASSA_SNO || "не задан"}, налог=${
        process.env.ROBOKASSA_TAX || "none"
      }, подпись=${process.env.ROBOKASSA_RECEIPT_ENCODE || "url"})`
    : "нет (чек формирует Robokassa по описанию заказа)"
);
console.log();

if (!login || !pass1 || !pass2) {
  console.error(
    "❌ Не заданы ROBOKASSA_LOGIN / ROBOKASSA_PASSWORD1 / ROBOKASSA_PASSWORD2 — онлайн-оплата на сайте выключена."
  );
  process.exit(1);
}

const dirty = dirtyKeys.filter(
  (k) => k.startsWith("ROBOKASSA_") || k === "SITE_URL"
);
if (dirty.length > 0) {
  console.warn(
    `⚠️  В .env.production у ${dirty.join(", ")} в конце строки невидимые символы (пробел или Windows-перевод строки).\n` +
      "    Скрипт их отрезал, но проверь файл: cat -A .env.production — и убери «^M» и пробелы в концах строк.\n"
  );
}
if (pass1.includes("$") || pass2.includes("$") || pass1.includes("\\") || pass2.includes("\\")) {
  console.warn(
    "⚠️  В пароле есть символ $ или \\ — такие значения искажались standalone-сервером Next\n" +
      "    (интерполяция .env). Обнови deploy/update.sh (git pull) и пересоберись,\n" +
      "    либо смени пароль в технастройках Robokassa на буквы/цифры.\n"
  );
}
if (isTest && !process.env.ROBOKASSA_TEST_PASSWORD1) {
  console.log(
    "ℹ️  Тестовый режим включён, отдельные тестовые пароли не заданы —\n" +
      "    значит, в ROBOKASSA_PASSWORD1/2 должны лежать ТЕСТОВЫЕ пароли из технастроек.\n"
  );
}

// --- 1. Связь + пара «логин + Пароль#2» (XML OpStateExt) --------------------
// Спрашиваем состояние заведомо отсутствующего счёта. Верная подпись → сервис
// отвечает «операция не найдена»; неверная → жалуется на подпись/магазин.
const probeInvId = 900000000 + Math.floor(Math.random() * 99999999);
const opStateUrl =
  "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt?" +
  new URLSearchParams({
    MerchantLogin: login,
    InvoiceID: String(probeInvId),
    Signature: hash(`${login}:${probeInvId}:${pass2}`),
  });

console.log("Проверяю связь с Robokassa (XML OpStateExt)…\n");
let xml = "";
try {
  const res = await fetch(opStateUrl, { signal: AbortSignal.timeout(15000) });
  xml = await res.text();
  if (!res.ok && !xml.includes("<")) {
    console.error(`❌ Robokassa ответила HTTP ${res.status} без XML.`);
    console.error(xml.slice(0, 300));
    process.exit(1);
  }
} catch (e) {
  const code = e?.cause?.code || "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    console.error(`❌ Не резолвится auth.robokassa.ru (${code}) — проверь DNS на сервере.`);
  } else if (e?.name === "TimeoutError" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    console.error(`❌ Robokassa не отвечает (${code || "таймаут 15 с"}) — сеть/файрвол между VPS и сервисом.`);
  } else {
    console.error(`❌ Запрос не прошёл: ${code || e?.message || e}`);
  }
  process.exit(1);
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
};
const resultBlock = tag(xml, "Result");
const code = Number(tag(resultBlock, "Code"));
const description = tag(resultBlock, "Description");

if (Number.isNaN(code)) {
  console.error("❌ Не понял ответ Robokassa:");
  console.error(xml.slice(0, 500));
  process.exit(1);
}
if (code === 3 || code === 0) {
  // 3 — операции нет (ожидаемо для случайного номера), 0 — вдруг нашлась.
  console.log(`✅ Связь есть, магазин и Пароль#2 приняты (ответ: код ${code} — ${description || "без описания"}).`);
} else {
  console.error(`❌ Robokassa отказала: код ${code} — ${description || "без описания"}`);
  console.error(`
Частые причины:
  • неверный ROBOKASSA_LOGIN (это идентификатор магазина из ЛК, не e-mail);
  • Пароль#2 не тот: в тестовом режиме нужен ТЕСТОВЫЙ Пароль#2,
    в боевом — боевой (ROBOKASSA_TEST=${isTest ? "1" : "не задан"});
  • в технастройках магазина выбран другой алгоритм хеша (сейчас ${algo}) —
    смени ROBOKASSA_HASH под то, что стоит в ЛК;
  • скрытый символ в .env.production (проверь: cat -A .env.production).`);
  process.exit(1);
}

// --- 2. Подпись исходящего платежа (Пароль#1) -------------------------------
// Ссылка без чека — её длина заведомо в пределах лимита URL. Сайт при оплате
// шлёт те же параметры POST-формой (см. lib/robokassa.ts).
const demoInvId = probeInvId;
const outSum = "1.00";
const payParams = new URLSearchParams({
  MerchantLogin: login,
  OutSum: outSum,
  InvId: String(demoInvId),
  Description: "Проверка подключения (можно не оплачивать)",
  SignatureValue: hash(`${login}:${outSum}:${demoInvId}:${pass1}`),
  Culture: "ru",
  Encoding: "utf-8",
});
if (isTest) payParams.set("IsTest", "1");

console.log();
console.log("Ссылка на пробный платёж на 1 ₽ (подпись Паролем#1):");
console.log(`https://auth.robokassa.ru/Merchant/Index.aspx?${payParams}`);
console.log(`
Открой её в браузере:
  • открылась страница оплаты — Пароль#1 и алгоритм хеша верные;
  • «Ошибка в параметрах» / «неверная подпись» — Пароль#1 или ROBOKASSA_HASH
    не совпадают с технастройками магазина в ЛК Robokassa.

Если сайт при этом не предлагает онлайн-оплату:
  1) bash deploy/update.sh (ключи вшиваются при сборке — перезапуска мало);
  2) не помогло — pm2 delete seeds && pm2 start ecosystem.config.js;
  3) точные ошибки — в pm2 logs seeds (строки [robokassa]).`);
