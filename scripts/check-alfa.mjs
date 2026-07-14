// Самодиагностика интернет-эквайринга Альфа-Банка с этого сервера.
//
//   node scripts/check-alfa.mjs
//
// Читает ALFA_* из .env.production, регистрирует пробный платёж на 1 ₽ тем же
// способом, что и сайт (Node fetch), и печатает либо ответ банка, либо точную
// причину сетевой/TLS-ошибки с подсказкой, что чинить.
// Пробный платёж оплачивать не нужно — он просто останется неоплаченным.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
  return env;
}

// NODE_EXTRA_CA_CERTS действует, только если задан ДО старта Node. Если он
// прописан в .env.production, а скрипт запущен без него — перезапускаем себя.
const startedWithExtraCa = Boolean(process.env.NODE_EXTRA_CA_CERTS);
const fileEnv = readEnvFile(path.join(root, ".env.production"));
if (fileEnv.NODE_EXTRA_CA_CERTS && !startedWithExtraCa && !process.env.__ALFA_CHECK_CHILD) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: fileEnv.NODE_EXTRA_CA_CERTS,
      __ALFA_CHECK_CHILD: "1",
    },
  });
  process.exit(r.status ?? 1);
}
for (const [k, v] of Object.entries(fileEnv)) {
  if (!(k in process.env)) process.env[k] = v;
}

const gateway = (process.env.ALFA_GATEWAY || "").replace(/\/+$/, "");
const username = process.env.ALFA_USERNAME || "";
const password = process.env.ALFA_PASSWORD || "";

console.log("Шлюз (ALFA_GATEWAY):  ", gateway || "— не задан");
console.log("Логин (ALFA_USERNAME):", username || "— не задан");
console.log("Пароль (ALFA_PASSWORD):", password ? "задан" : "— не задан");
console.log(
  "NODE_EXTRA_CA_CERTS:  ",
  process.env.NODE_EXTRA_CA_CERTS || "— не задан"
);
console.log();

if (!gateway || !username || !password) {
  console.error(
    "❌ Не все переменные ALFA_* заданы в .env.production — онлайн-оплата на сайте выключена."
  );
  process.exit(1);
}

if (gateway.includes("rbsuat.com")) {
  console.log("ℹ️  Это ТЕСТОВЫЙ шлюз (песочница): оплата только тестовыми картами банка.");
}
if (username.startsWith("r-") && gateway.includes("pay.alfabank.ru")) {
  console.warn(
    "⚠️  Логин с префиксом r- работает через https://payment.alfabank.ru/payment/rest, а не pay.alfabank.ru."
  );
}
if (!username.endsWith("-api")) {
  console.warn("⚠️  Обычно API-логин оканчивается на -api. Проверь, что это не логин от ЛК.");
}

const site = (process.env.SITE_URL || "https://tomatsemena.ru").replace(/\/+$/, "");
const body = new URLSearchParams({
  userName: username,
  password,
  orderNumber: `check-${Date.now()}`,
  amount: "100", // 1 ₽ в копейках
  currency: "643",
  returnUrl: `${site}/`,
  description: "Проверка подключения (не оплачивать)",
  language: "ru",
});

console.log(`Регистрирую пробный платёж на 1 ₽: ${gateway}/register.do ...\n`);

try {
  const res = await fetch(`${gateway}/register.do`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`❌ Шлюз ответил не-JSON (HTTP ${res.status}) — скорее всего, неверный адрес ALFA_GATEWAY.`);
    console.error(text.slice(0, 300));
    process.exit(1);
  }

  if (data.formUrl && data.orderId) {
    console.log("✅ Всё работает: банк зарегистрировал пробный платёж.");
    console.log("Платёжная форма:", data.formUrl);
    console.log();
    console.log("Если сайт при этом пишет «Онлайн-оплата временно недоступна» —");
    console.log("процесс сайта запущен со старыми переменными: bash deploy/update.sh");
  } else {
    console.error(
      `❌ Банк отказал: код ${data.errorCode ?? "?"} — ${data.errorMessage ?? "без описания"}`
    );
    if (String(data.errorCode) === "5") {
      console.error(`
Частые причины «доступ запрещён»:
  • опечатка/лишний пробел в логине или пароле в .env.production;
  • тестовые ключи на боевом шлюзе или боевые на тестовом
    (тест — https://alfa.rbsuat.com/payment/rest);
  • у боевого -api-логина не сменён первичный пароль (сменить в ЛК);
  • логин заблокирован после нескольких неверных попыток — подожди или
    обратись в поддержку эквайринга.`);
    }
    process.exit(1);
  }
} catch (e) {
  const cause = e?.cause ?? {};
  const code = cause.code || "";
  const tlsCodes = new Set([
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERT_UNTRUSTED",
  ]);

  if (tlsCodes.has(code)) {
    console.error(`❌ TLS: система не доверяет сертификату шлюза (${code}).

Шлюзы Альфы работают на сертификатах Минцифры («Russian Trusted CA»).
Установи их один раз (от root):

  curl -fsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt \\
    -o /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
  curl -fsSL https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt \\
    -o /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt
  update-ca-certificates

Node не читает системное хранилище, поэтому добавь в .env.production строку:

  NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

и выполни: bash deploy/update.sh. Потом запусти этот скрипт ещё раз.`);
  } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    console.error(`❌ Не резолвится адрес шлюза (${code}) — проверь ALFA_GATEWAY и DNS на сервере.`);
  } else if (e?.name === "TimeoutError" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    console.error(`❌ Шлюз не отвечает (${code || "таймаут 15 с"}) — сеть/файрвол между VPS и банком.`);
  } else {
    console.error(`❌ Запрос не прошёл: ${code || cause.message || e?.message || e}`);
  }
  process.exit(1);
}
