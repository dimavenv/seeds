import "server-only";
import crypto from "node:crypto";

// Коды подтверждения почты при регистрации — без хранения в БД.
// Сервер выдаёт клиенту «билет»: AES-256-GCM-контейнер с почтой, кодом и сроком
// годности. Подделать или прочитать билет без серверного ключа нельзя (GCM
// проверяет целостность), а расшифровать его может любой воркер pm2 — ключ
// детерминированный. Клиент присылает билет + код, сервер сверяет.

const TTL_MS = 15 * 60 * 1000; // код живёт 15 минут

function key(): Buffer {
  // Детерминированный ключ из серверных секретов (одинаков на всех воркерах).
  const src =
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.PB_ADMIN_PASSWORD ||
    "dev-email-code-secret";
  return crypto.createHash("sha256").update(`email-code:${src}`).digest();
}

export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function issueTicket(email: string, code: string): string {
  const payload = JSON.stringify({ e: email, c: code, x: Date.now() + TTL_MS });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export type Ticket = { email: string; code: string; expired: boolean };

// null — билет повреждён/подделан; expired проверяется отдельно, чтобы дать
// понятную ошибку «код устарел» вместо «неверный код».
export function readTicket(ticket: string): Ticket | null {
  try {
    const raw = Buffer.from(ticket, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const p = JSON.parse(json) as { e?: string; c?: string; x?: number };
    if (typeof p.e !== "string" || typeof p.c !== "string" || typeof p.x !== "number") {
      return null;
    }
    return { email: p.e, code: p.c, expired: Date.now() > p.x };
  } catch {
    return null;
  }
}

// Сверка кода без утечки по времени сравнения.
export function codeMatches(ticket: Ticket, input: string): boolean {
  const a = Buffer.from(ticket.code);
  const b = Buffer.from(String(input).trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Простейший лимитер попыток в памяти процесса (на воркер) — от перебора кода
// и спама повторной отправкой. Для магазина этого достаточно.
const buckets = new Map<string, { n: number; resetAt: number }>();

export function allowAttempt(bucket: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  // Защита от разрастания: чистим только ИСТЁКШИЕ окна. Раньше здесь был
  // clear() всей карты — он сбрасывал и активные лимиты, то есть поток
  // мусорных ключей обнулял ограничения для всех.
  if (buckets.size > 10_000) {
    for (const [key, val] of buckets) {
      if (now > val.resetAt) buckets.delete(key);
    }
  }
  const b = buckets.get(bucket);
  if (!b || now > b.resetAt) {
    buckets.set(bucket, { n: 1, resetAt: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}
