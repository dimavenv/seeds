import "server-only";
import crypto from "node:crypto";

// Шифрование чувствительных полей (телефон, email, адрес) перед записью в БД,
// чтобы они не хранились в открытом виде. Ключ — в DATA_ENCRYPTION_KEY (только
// сервер). Если ключ не задан — функции работают как «no-op» (обратная
// совместимость: старые/новые записи в открытом виде, ничего не ломается).
//
// Сгенерировать ключ: openssl rand -base64 32

const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, "hex");
  else key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function encryptField<T extends string | null | undefined>(
  text: T
): string | null {
  if (text == null || text === "") return (text ?? null) as string | null;
  const key = getKey();
  if (!key) return text; // ключ не задан — храним как есть
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value; // не зашифровано
  const key = getKey();
  if (!key) return value; // нечем расшифровать — отдаём как есть
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    return value;
  }
}
