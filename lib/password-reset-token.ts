import crypto from "node:crypto";

export const INVALID_RESET_LINK =
  "Ссылка недействительна или срок её действия истёк. Запросите восстановление пароля ещё раз.";

const TOKEN_BYTES = 32;

export function resetTokenTtlMs(): number {
  const minutes = Number(process.env.PASSWORD_RESET_TTL_MIN);
  const safe =
    Number.isFinite(minutes) && minutes >= 10 && minutes <= 1440
      ? minutes
      : 30;
  return safe * 60 * 1000;
}

// В ссылке находится только случайный одноразовый идентификатор. Email,
// пароль и другие данные пользователя туда не попадают. В базе хранится лишь
// SHA-256: даже чтение базы не позволяет воспользоваться выданной ссылкой.
export function generateResetToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isResetToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashResetToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
