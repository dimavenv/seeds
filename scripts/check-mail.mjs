// Проверка отправки почты (SMTP) с этого сервера.
//
//   node scripts/check-mail.mjs адрес@куда-послать.ru
//
// Читает SMTP_* из .env.production и шлёт тестовое письмо тем же способом,
// что и сайт. Печатает либо «отправлено», либо точную причину ошибки.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import nodemailer from "nodemailer";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(file) {
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#")) {
        // Кавычки снимаем только парой — одиночная остаётся частью значения.
        env[m[1]] = m[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
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

function explain(msg) {
  if (/auth|535|Invalid login|credentials/i.test(msg)) {
    return `
Похоже, логин/пароль не подходят:
  • для Яндекса и Mail.ru нужен «пароль приложения», а не пароль от почты
    (создаётся в настройках безопасности ящика);
  • у Яндекса включите «Разрешить доступ по протоколу IMAP/SMTP» в настройках;
  • для ящиков рег.ру — пароль, заданный ящику в панели «Почта».`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout/i.test(msg)) {
    return `
Похоже, сервер недоступен:
  • проверьте SMTP_HOST/SMTP_PORT (Яндекс: smtp.yandex.ru:465, Mail.ru: smtp.mail.ru:465);
  • некоторые VPS-провайдеры блокируют исходящий порт 25 — используйте 465.`;
  }
  if (/certificate|TLS|SSL/i.test(msg)) {
    return "\nПроблема с TLS-сертификатом — проверьте, что SMTP_PORT=465 для SSL-подключения.";
  }
  return "";
}

// Диагностика доставляемости: SPF/DKIM/DMARC у домена отправителя.
// Именно их отсутствие — обычная причина, по которой письма к Mail.ru приходят
// с задержкой в минуты (серые списки) или падают в спам. Сам код отправки на
// это повлиять не может, лечится записями в DNS.
async function checkDeliverability() {
  const fromHeader = process.env.MAIL_FROM || user;
  const fromAddr = (fromHeader.match(/<([^>]+)>/)?.[1] ?? fromHeader).trim();
  const fromDomain = fromAddr.split("@")[1]?.toLowerCase() || "";
  const authDomain = user.split("@")[1]?.toLowerCase() || "";

  console.log("— Доставляемость —");
  if (fromDomain && authDomain && fromDomain !== authDomain) {
    console.error(
      `⚠️  MAIL_FROM (${fromAddr}) и SMTP_USER (${user}) в разных доменах.\n` +
        "   Сайт подставляет в конверт письма адрес SMTP_USER, чтобы сходилась\n" +
        "   проверка SPF, но в заголовке останется чужой домен — часть фильтров\n" +
        "   (в том числе Mail.ru) относится к этому настороженно. Лучше указать\n" +
        "   в MAIL_FROM тот же ящик, из которого идёт отправка."
    );
  }
  if (!fromDomain) return;

  const txt = async (name) => {
    try {
      return (await dns.resolveTxt(name)).map((r) => r.join(""));
    } catch {
      return [];
    }
  };

  const spf = (await txt(fromDomain)).filter((r) => /^v=spf1/i.test(r));
  if (spf.length > 0) console.log(`✅ SPF у ${fromDomain}: ${spf[0]}`);
  else
    console.error(
      `❌ SPF у ${fromDomain} не найден — добавьте TXT-запись из панели почтового провайдера.`
    );

  const dmarc = (await txt(`_dmarc.${fromDomain}`)).filter((r) => /^v=DMARC1/i.test(r));
  if (dmarc.length > 0) console.log(`✅ DMARC у ${fromDomain}: ${dmarc[0]}`);
  else
    console.error(
      `❌ DMARC у ${fromDomain} не найден — добавьте TXT _dmarc.${fromDomain} со значением\n` +
        `   "v=DMARC1; p=none; rua=mailto:postmaster@${fromDomain}" (позже можно ужесточить).`
    );

  // Селектор DKIM у каждого провайдера свой — перебираем частые.
  const SELECTORS = ["mail", "default", "dkim", "mx", "selector1", "selector2", "s1", "s2", "key1"];
  let dkim = null;
  for (const sel of SELECTORS) {
    const rec = await txt(`${sel}._domainkey.${fromDomain}`);
    if (rec.some((r) => /(v=DKIM1|p=)/i.test(r))) {
      dkim = sel;
      break;
    }
  }
  if (dkim) console.log(`✅ DKIM у ${fromDomain}: селектор «${dkim}»`);
  else
    console.error(
      `❌ DKIM у ${fromDomain} не найден по частым селекторам (${SELECTORS.join(", ")}).\n` +
        "   Возьмите запись в панели почтового провайдера и добавьте в DNS —\n" +
        "   без DKIM Mail.ru придерживает письма от нового отправителя."
    );
  console.log();
}

await checkDeliverability();

async function trySend(label, auth, from) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth,
    connectionTimeout: 8000,
    socketTimeout: 15000,
  });
  try {
    const info = await transport.sendMail({
      from,
      to,
      // Как на сайте: обратный адрес конверта — реально авторизованный ящик
      // (см. lib/email.ts), иначе не сходится SPF.
      envelope: { from: auth.user, to },
      subject: `Проверка почты (${label}) — Томат Семена`,
      html: `<p>Тестовое письмо «${label}» с сервера tomatsemena.ru. Если вы его видите — этот ящик настроен правильно ✅</p>`,
    });
    console.log(`✅ ${label}: отправлено с ${auth.user} (${info.response ?? "ok"}).`);
    return true;
  } catch (e) {
    const msg = e?.message || String(e);
    console.error(`❌ ${label}: не отправилось с ${auth.user} — ${msg}${explain(msg)}`);
    if (/auth|535|Invalid login|credentials/i.test(msg)) {
      const p = auth.pass || "";
      const quoteHint = /^["']|["']$/.test(p)
        ? " — начинается или заканчивается кавычкой! Если кавычка не часть пароля, уберите её; если часть — проще сменить пароль ящика на буквы+цифры"
        : "";
      console.error(`  Пароль, который реально ушёл на сервер: ${p.length} символов${quoteHint}.`);
    }
    return false;
  }
}

let ok = await trySend(
  "основной ящик",
  { user, pass },
  process.env.MAIL_FROM || `"Томат Семена" <${user}>`
);

// Отдельные ящики уведомлений продавцу (order@/review@/support@) — если заданы.
const CATEGORIES = [
  ["заказы", "ORDERS", "Заказы · Томат Семена"],
  ["отзывы", "REVIEWS", "Отзывы · Томат Семена"],
  ["поддержка", "SUPPORT", "Поддержка · Томат Семена"],
];
for (const [label, suffix, name] of CATEGORIES) {
  const u = (process.env[`SMTP_USER_${suffix}`] || "").trim();
  const p = process.env[`SMTP_PASSWORD_${suffix}`] || "";
  if (!u && !p) continue; // категория не настроена — шлёт основной ящик
  if (!u || !p) {
    console.error(`❌ ${label}: заданы не оба ключа — нужны SMTP_USER_${suffix} и SMTP_PASSWORD_${suffix}.`);
    ok = false;
    continue;
  }
  const from = process.env[`MAIL_FROM_${suffix}`] || `"${name}" <${u}>`;
  if (!(await trySend(label, { user: u, pass: p }, from))) ok = false;
}

if (ok) {
  console.log(`\nПроверьте входящие (и «Спам») на ${to}.`);
  console.log("Если письма в спаме — настройте SPF/DKIM у почтового провайдера (SETUP-MAIL-RU.md).");
  // Получателей уведомлений двое: служебный ящик и «обычная» почта. Логика
  // разбора повторяет notifyRecipients() из lib/admin-mail.ts.
  const looksLikeEmail = (a) => /^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[a-z]{2,}$/i.test(a);
  const notify = [];
  const bad = [];
  for (const part of `${process.env.ADMIN_NOTIFY_EMAIL || ""},${
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA || ""
  }`.split(/[,;]+/)) {
    const addr = part.trim();
    if (!addr) continue;
    if (!looksLikeEmail(addr)) bad.push(addr);
    else if (!notify.some((x) => x.toLowerCase() === addr.toLowerCase())) notify.push(addr);
  }
  if (notify.length > 0) {
    console.log(`Уведомления продавцу идут на: ${notify.join(", ")}`);
  } else {
    console.log(
      "ADMIN_NOTIFY_EMAIL и ADMIN_NOTIFY_EMAIL_EXTRA не заданы — уведомления продавцу выключены."
    );
  }
  if (bad.length > 0) {
    console.error(
      `❌ Не похожи на адрес и будут пропущены: ${bad.join(", ")} — проверьте ADMIN_NOTIFY_EMAIL / ADMIN_NOTIFY_EMAIL_EXTRA.`
    );
  }
} else {
  process.exit(1);
}
