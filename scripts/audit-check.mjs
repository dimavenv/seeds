// Проверка зависимостей на уязвимости с учётом принятых исключений.
//
//   npm run audit:check
//
// Зачем не просто `npm audit`: в проекте всегда найдётся уязвимость, которую
// нельзя закрыть сегодня (например, чинится только сменой мажорной версии
// фреймворка). Голый `npm audit` в CI тогда горит постоянно, к красному
// билду привыкают — и настоящая новая уязвимость проходит незамеченной.
//
// Поэтому исключения оформляются явно: пакет, причина и ДАТА ПЕРЕСМОТРА в
// security/audit-allowlist.json. Просроченное исключение роняет проверку так
// же, как новая уязвимость: это единственный способ не дать «временному»
// исключению стать вечным.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEVELS = ["info", "low", "moderate", "high", "critical"];
const MIN_LEVEL = process.env.AUDIT_LEVEL || "high";

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exitCode = 1;
}

const allowlist = JSON.parse(
  fs.readFileSync(path.join(root, "security", "audit-allowlist.json"), "utf8")
);
const allowed = new Map(allowlist.allow.map((a) => [a.package, a]));

// npm audit возвращает ненулевой код, когда что-то найдено, — это не ошибка
// запуска, поэтому разбираем вывод, а не полагаемся на код возврата.
let report;
try {
  report = JSON.parse(
    execFileSync("npm", ["audit", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  );
} catch (e) {
  if (!e.stdout) {
    console.error("Не удалось выполнить npm audit:", e.message);
    process.exit(2);
  }
  report = JSON.parse(e.stdout);
}

const today = new Date().toISOString().slice(0, 10);
const found = Object.values(report.vulnerabilities ?? {}).filter(
  (v) => LEVELS.indexOf(v.severity) >= LEVELS.indexOf(MIN_LEVEL)
);

const seen = new Set();
for (const v of found) {
  const rule = allowed.get(v.name);
  if (!rule) {
    fail(
      `${v.name} (${v.severity}, ${v.range}) — уязвимость без исключения.\n` +
        `   Почините (npm audit fix) или добавьте осознанное исключение с причиной\n` +
        `   и датой пересмотра в security/audit-allowlist.json.`
    );
    continue;
  }
  seen.add(v.name);
  if (rule.until < today) {
    fail(
      `${v.name} (${v.severity}): срок принятого исключения истёк ${rule.until}.\n` +
        `   Это не поломка сайта — падает только эта проверка. Дальше три пути:\n` +
        `   1) обновить пакет, если починка уже вышла (npm audit fix);\n` +
        `   2) если починка требует миграции — запланировать её и продлить\n` +
        `      until в security/audit-allowlist.json, дописав, почему ждём;\n` +
        `   3) если уязвимость к нам неприменима — записать это в reason.\n` +
        `   Молча продлевать дату не надо: смысл срока в том, чтобы решение\n` +
        `   принимали заново, а не забывали о нём.`
    );
    continue;
  }
  console.log(
    `⚠️  ${v.name} (${v.severity}) — принято до ${rule.until}: ${
      Array.isArray(rule.reason) ? rule.reason[0] : rule.reason
    }`
  );
}

// Исключение, которое больше ни к чему не относится, — мусор: оно молча
// прикроет ту же уязвимость, если она вернётся.
for (const [name, rule] of allowed) {
  if (!seen.has(name)) {
    fail(
      `${name}: исключение в audit-allowlist.json больше не нужно (уязвимости нет) — удалите его. Было принято до ${rule.until}.`
    );
  }
}

if (process.exitCode) {
  console.error("\nПроверка зависимостей не пройдена.");
} else {
  console.log(
    `\n✅ Новых уязвимостей уровня ${MIN_LEVEL}+ нет (принятых исключений: ${seen.size}).`
  );
}
