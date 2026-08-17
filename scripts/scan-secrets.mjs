// Поиск секретов во ВСЕЙ истории репозитория.
//
//   npm run scan:secrets
//
// Зачем история, а не текущие файлы: пароль, закоммиченный полгода назад и
// «удалённый» следующим коммитом, из репозитория никуда не делся — он лежит в
// объектах git и уезжает вместе с каждым клоном. Единственное лечение —
// сменить сам секрет, и узнать об этом надо не от того, кто его нашёл.
//
// Проверка идёт по объектам git (все ветки, все коммиты), а не по diff'ам:
// так файл виден целиком независимо от того, сколько раз его переписывали.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Имена файлов, которых в репозитории быть не должно ни в одном коммите.
const FORBIDDEN_PATHS =
  /(^|\/)(\.env(\.[a-z0-9_.-]+)?|id_rsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|rclone\.conf|backup\.conf)$/i;
// ...кроме образца настроек: он для того и нужен, чтобы лежать в репозитории.
const ALLOWED_PATHS = /(^|\/)\.env\.local\.example$/;

// Пути, которые не относятся к нашему коду. .claude/skills — привезённые
// со стороны справочники по безопасности: они СОСТОЯТ из примеров ключей
// («AKIAIOSFODNN7EXAMPLE» и подобных), и в них искать секреты бессмысленно.
const SKIP_PATHS = /^(\.claude\/|node_modules\/|package-lock\.json$|skills-lock\.json$)/;

const SECRET_KEYS =
  "PB_ADMIN_PASSWORD|SMTP_PASSWORD|DATA_ENCRYPTION_KEY|CRON_SECRET|SMARTCAPTCHA_SERVER_KEY|DADATA_TOKEN|ROBOKASSA_PASSWORD[12]?|ROBOKASSA_PASS[12]?|BACKUP_PASSPHRASE|VKID_CLIENT_SECRET|YANDEX_CLIENT_SECRET|AWS_SECRET_ACCESS_KEY|secret_access_key";

// Явные пометки «это пример».
const OBVIOUS_PLACEHOLDER =
  /(example|placeholder|changeme|change_me|your[-_]?|todo|xxxx|\bfake\b|\btest\b|dummy|значение|пароль|ключ|секрет)/i;

// Похоже ли значение на НАСТОЯЩИЙ секрет.
//
// Главная задача проверки — не поднимать тревогу на образцах настроек и
// документации, иначе её выключат в первую же неделю. Настоящий секрет — это
// длинная случайная строка; «СИЛЬНЫЙ-ПАРОЛЬ», «пароль-приложения»,
// «process.env.X» и пустое значение таковыми не являются.
function looksLikeSecret(raw) {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  if (value.length < 12) return false;
  // Кириллица в секрете не встречается, а в подсказках из документации — да.
  if (/[\u0400-\u04FF]/.test(value)) return false;
  // Ссылка на переменную окружения, шаблон, вызов функции — это код, а не ключ.
  if (/[(){}$<>\\]|process\.|os\.environ|import\.meta|\.\.\./.test(value)) return false;
  if (OBVIOUS_PLACEHOLDER.test(value)) return false;
  // Осмысленный текст через дефисы («боевой-пароль-1») случайным не бывает.
  if (/^[a-z]+([-_][a-z0-9]+)*$/.test(value)) return false;

  // Энтропия Шеннона: у случайной строки она заметно выше, чем у слова.
  const freq = new Map();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const n of freq.values()) {
    const p = n / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy >= 3.2;
}

const RULES = [
  {
    name: "значение секретной переменной",
    // KEY=значение или KEY: значение, кавычки не обязательны.
    // Пробелы вокруг «=» — только горизонтальные: с \s* пустое значение
    // «KEY=» склеивалось со следующей строкой файла и выдавало ложную тревогу.
    re: new RegExp(
      `\\b(${SECRET_KEYS})[ \\t]*[:=][ \\t]*["']?([^"'\\s#]+)`,
      "gi"
    ),
    value: (m) => m[2],
  },
  {
    name: "приватный ключ",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    value: () => "приватный ключ",
  },
  {
    name: "ключ доступа AWS/S3",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    value: (m) => m[0],
  },
  {
    name: "OAuth-токен Яндекса",
    re: /\by0_[A-Za-z0-9_-]{20,}/g,
    value: (m) => m[0],
  },
];

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
}

const problems = [];

// ===== 1. Запрещённые файлы в любом коммите =====
const objects = git(["rev-list", "--objects", "--all"])
  .split("\n")
  .filter(Boolean);

const blobs = new Map(); // sha -> путь (любой из встреченных)
for (const line of objects) {
  const sp = line.indexOf(" ");
  if (sp === -1) continue;
  const sha = line.slice(0, sp);
  const file = line.slice(sp + 1);
  if (!file) continue;
  if (
    FORBIDDEN_PATHS.test(file) &&
    !ALLOWED_PATHS.test(file) &&
    !SKIP_PATHS.test(file)
  ) {
    problems.push(
      `запрещённый файл в истории: ${file}\n   → он попал в репозиторий; смените содержавшиеся в нём секреты и вычистите историю`
    );
  }
  blobs.set(sha, file);
}

// ===== 2. Содержимое всех текстовых объектов =====
//
// Читаем объекты пачкой через git cat-file --batch: по одному вызову на
// каждый было бы на порядок медленнее.
const shas = [...blobs.keys()];
const CHUNK = 500;
const MAX_BLOB = 512 * 1024; // огромные файлы (лок-файлы, картинки) не смотрим

for (let i = 0; i < shas.length; i += CHUNK) {
  const chunk = shas.slice(i, i + CHUNK);
  // Без encoding: нужен Buffer — объекты git могут быть двоичными, и через
  // строку они бы испортились.
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: chunk.join("\n") + "\n",
    maxBuffer: 512 * 1024 * 1024,
  });

  let pos = 0;
  while (pos < out.length) {
    const nl = out.indexOf(0x0a, pos);
    if (nl === -1) break;
    const header = out.slice(pos, nl).toString("utf8");
    const [sha, type, sizeRaw] = header.split(" ");
    const size = Number(sizeRaw);
    if (type !== "blob" || !Number.isFinite(size)) {
      pos = nl + 1;
      continue;
    }
    const body = out.slice(nl + 1, nl + 1 + size);
    pos = nl + 1 + size + 1;

    if (size > MAX_BLOB) continue;
    // Двоичные файлы пропускаем: нулевой байт — надёжный признак.
    if (body.includes(0)) continue;

    const file = blobs.get(sha) ?? sha;
    if (SKIP_PATHS.test(file)) continue;
    const text = body.toString("utf8");
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        const value = rule.value(m);
        // Приватный ключ отмечаем всегда: там нечего оценивать по форме.
        if (rule.name !== "приватный ключ" && !looksLikeSecret(value)) continue;
        const masked =
          value.length > 8 ? `${value.slice(0, 3)}…${value.slice(-2)}` : "***";
        problems.push(`${rule.name} в ${file}: ${m[1] ?? ""} = ${masked}`);
      }
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error("❌ Найдены секреты в репозитории:\n");
  for (const p of unique) console.error(` • ${p}`);
  console.error(
    "\nСекрет, побывавший в git, считается скомпрометированным: смените его,\n" +
      "а не просто удалите файл следующим коммитом."
  );
  process.exit(1);
}

console.log(`✅ Секретов не найдено (проверено объектов: ${blobs.size}).`);
