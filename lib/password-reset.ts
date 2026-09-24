import "server-only";
import type PocketBase from "pocketbase";
import { pbAdmin } from "@/lib/pb/server";
import { sendMail, mailLayout, escapeHtml } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo";
import {
  generateResetToken,
  hashResetToken,
  INVALID_RESET_LINK,
  isResetToken,
  resetTokenTtlMs,
} from "@/lib/password-reset-token";

const TOKENS = "password_reset_tokens";
export type PasswordLinkPurpose = "reset" | "setup";

type Account = { id: string; email: string };
type ValidToken = {
  recordId: string;
  userId: string;
  email: string;
  purpose: PasswordLinkPurpose;
  expiresAt: string;
};

// Ответ наружу всегда одинаковый, поэтому наличие аккаунта по email не
// раскрывается. Эта функция используется только сервером.
export async function findAccountByEmail(email: string, client?: PocketBase): Promise<Account | null> {
  const pb = client ?? (await pbAdmin());
  const normalized = email.trim().toLowerCase();
  const page = await pb.collection("users").getList(1, 1, {
    filter: pb.filter("email = {:email}", { email: normalized }),
    fields: "id,email",
  });
  // Исторические записи могли быть импортированы без нормализации регистра.
  // Для новых аккаунтов lower(email) защищён уникальным индексом в схеме.
  const record = page.items[0] ?? (await pb.collection("users").getFullList({
    fields: "id,email",
  })).find((user) => String(user.email ?? "").trim().toLowerCase() === normalized);
  return record
    ? { id: record.id, email: String(record.email ?? email).toLowerCase() }
    : null;
}

async function removeTokensForUser(
  pb: PocketBase,
  userId: string,
  purpose?: PasswordLinkPurpose
): Promise<void> {
  const filter = purpose
    ? pb.filter("user = {:user} && purpose = {:purpose}", { user: userId, purpose })
    : pb.filter("user = {:user}", { user: userId });
  const records = await pb.collection(TOKENS).getFullList({ filter, fields: "id" });
  await Promise.all(
    records.map((record) => pb.collection(TOKENS).delete(record.id).catch(() => false))
  );
}

export async function createPasswordLink(
  pb: PocketBase,
  userId: string,
  purpose: PasswordLinkPurpose
): Promise<{ url: string; recordId: string }> {
  // Новая ссылка отменяет предыдущую того же назначения.
  await removeTokensForUser(pb, userId, purpose);
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + resetTokenTtlMs()).toISOString();
  const record = await pb.collection(TOKENS).create({
    user: userId,
    token_hash: hashResetToken(token),
    purpose,
    expires_at: expiresAt,
  });
  console.log(
    `[password-reset] создана ${purpose === "setup" ? "ссылка установки" : "ссылка восстановления"} для user ${userId}, запись ${record.id}`
  );
  return {
    url: absoluteUrl(`/password-reset?token=${encodeURIComponent(token)}`),
    recordId: record.id,
  };
}

export async function revokePasswordLink(pb: PocketBase, recordId: string): Promise<void> {
  await pb.collection(TOKENS).delete(recordId).catch(() => false);
}

export async function inspectPasswordToken(
  rawToken: string,
  client?: PocketBase
): Promise<ValidToken | null> {
  if (!isResetToken(rawToken)) return null;
  const pb = client ?? (await pbAdmin());
  const record = await pb
    .collection(TOKENS)
    .getFirstListItem(pb.filter("token_hash = {:hash}", { hash: hashResetToken(rawToken) }), {
      fields: "id,user,purpose,expires_at",
    })
    .catch(() => null);
  const expiresAt = record ? new Date(String(record.expires_at)).getTime() : NaN;
  if (!record || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const userId = String(record.user ?? "");
  if (!userId) return null;
  const user = await pb.collection("users").getOne(userId, { fields: "email" }).catch(() => null);
  if (!user) return null;
  return {
    recordId: record.id,
    userId,
    email: String(user.email ?? ""),
    purpose: record.purpose === "setup" ? "setup" : "reset",
    expiresAt: String(record.expires_at),
  };
}

export async function applyNewPassword(
  rawToken: string,
  password: string,
  client?: PocketBase
): Promise<
  | { ok: true; email: string }
  | { ok: false; error: string; status: number }
> {
  const pb = client ?? (await pbAdmin());
  const token = await inspectPasswordToken(rawToken, pb);
  if (!token) return { ok: false, error: INVALID_RESET_LINK, status: 400 };

  try {
    // Удаление ссылки и смена пароля — одна транзакция. Повторный запрос
    // не сможет удалить ту же запись; при сбое ссылка не теряется.
    const batch = pb.createBatch();
    batch.collection(TOKENS).delete(token.recordId);
    batch.collection("users").update(token.userId, {
      password,
      passwordConfirm: password,
      verified: true,
      auto_password: false,
      welcome_credentials: "",
    });
    await batch.send();
    await removeTokensForUser(pb, token.userId).catch(() => {});
    console.log(
      `[password-reset] пароль изменён для user ${token.userId}, ссылка ${token.recordId} использована`
    );
    return { ok: true, email: token.email };
  } catch (error) {
    // Транзакция откатилась. Если ссылку уже использовал другой запрос,
    // возвращаем обычное сообщение об истёкшей/использованной ссылке.
    if (!(await inspectPasswordToken(rawToken, pb))) {
      return { ok: false, error: INVALID_RESET_LINK, status: 400 };
    }
    const response = (error as {
      response?: { data?: {
        requests?: Record<string, { response?: { data?: Record<string, unknown> } }>;
        password?: unknown;
      } };
    })?.response;
    const data = response?.data?.requests?.["1"]?.response?.data ?? response?.data;
    if (data && "password" in data) {
      return {
        ok: false,
        error: "Пароль не соответствует требованиям безопасности",
        status: 400,
      };
    }
    console.error("[password-reset] не удалось изменить пароль:", error);
    return { ok: false, error: "Не удалось сменить пароль, попробуйте ещё раз", status: 503 };
  }
}

export async function cleanupExpiredPasswordTokens(pb: PocketBase): Promise<number> {
  const now = new Date().toISOString().replace("T", " ");
  const expired = await pb.collection(TOKENS).getFullList({
    filter: pb.filter("expires_at <= {:now}", { now }),
    fields: "id",
  });
  let removed = 0;
  for (const record of expired) {
    if (await pb.collection(TOKENS).delete(record.id).then(() => true).catch(() => false)) {
      removed++;
    }
  }
  return removed;
}

export async function sendResetEmail(email: string, url: string): Promise<boolean> {
  return sendMail(
    email,
    "Восстановление пароля — Томат Семена",
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Восстановление пароля</h1>
      <p style="margin:0 0 18px;">Для аккаунта <b>${escapeHtml(email)}</b>
      запросили новый пароль. Нажмите кнопку и задайте его самостоятельно:</p>
      <p style="margin:0 0 18px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#2e7d32;color:#fff;border-radius:10px;padding:11px 22px;font-weight:bold;text-decoration:none;">Установить новый пароль</a>
      </p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Ссылка одноразовая и действует
      ${Math.round(resetTokenTtlMs() / 60000)} минут. Если вы ничего не
      запрашивали, просто проигнорируйте письмо — пароль не изменится.</p>
    `),
    { replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER }
  );
}

export async function sendPasswordChangedEmail(email: string): Promise<boolean> {
  return sendMail(
    email,
    "Пароль изменён — Томат Семена",
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Пароль изменён</h1>
      <p style="margin:0 0 14px;">Пароль от аккаунта <b>${escapeHtml(email)}</b>
      только что изменён. Если это были вы — всё в порядке.</p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Если это были не вы —
      напишите на <a href="mailto:info@tomatsemena.ru" style="color:#2e7d32;">info@tomatsemena.ru</a>.</p>
    `)
  );
}
