import "server-only";
import crypto from "node:crypto";
import type PocketBase from "pocketbase";
import { escapeHtml, isMailConfigured, mailLayout, sendMail } from "@/lib/email";
import { absoluteUrl } from "@/lib/seo";

// Только для очереди первого письма. После передачи SMTP шифротекст удаляется.
// В отличие от encryptField, отсутствие ключа не допускает открытого хранения.
function key(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.PB_ADMIN_PASSWORD;
  if (!secret) throw new Error("Для очереди доступа нужен DATA_ENCRYPTION_KEY или PB_ADMIN_PASSWORD");
  return crypto.createHash("sha256").update(`account-welcome:v1:${secret}`).digest();
}

export function sealWelcomePassword(password: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

function openPassword(value: string): string {
  const raw = Buffer.from(value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export async function deliverAccountWelcome(pb: PocketBase, userId: string): Promise<void> {
  const user = await pb.collection("users").getOne(userId);
  const encrypted = String(user.welcome_credentials ?? "");
  if (!encrypted) return; // Старый аккаунт или письмо уже принято SMTP.
  if (!user.auto_password) {
    await pb.collection("users").update(userId, { welcome_credentials: "" });
    return; // Покупатель уже сменил пароль: старый больше не отправляем.
  }
  if (!isMailConfigured()) throw new Error("SMTP не настроен для письма доступа");
  const password = openPassword(encrypted);
  const email = String(user.email);
  const sent = await sendMail(email, "Ваш логин и пароль — Томат Семена", mailLayout(`
    <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Ваш личный кабинет готов</h1>
    <p>Спасибо за покупку! В кабинете можно следить за заказом и оформлять новые покупки.</p>
    <p>Логин: <b>${escapeHtml(email)}</b><br/>Пароль: <b>${escapeHtml(password)}</b></p>
    <p><a href="${escapeHtml(absoluteUrl("/login"))}" style="display:inline-block;background:#2e7d32;color:#fff;border-radius:10px;padding:11px 22px;text-decoration:none;">Войти в личный кабинет</a></p>
    <p>После входа вы можете поменять пароль в разделе «Настройки аккаунта → Безопасность».</p>
  `));
  if (!sent) throw new Error("SMTP не принял письмо доступа; оно осталось в очереди");
  await pb.collection("users").update(userId, { welcome_credentials: "" });
  console.log(`[account] письмо доступа отправлено для user ${userId}`);
}

export async function retryAccountWelcomes(pb: PocketBase): Promise<{ sent: number; failed: number }> {
  const pending = await pb.collection("users").getList(1, 50, {
    filter: 'welcome_credentials != ""', sort: "created", fields: "id",
  });
  let sent = 0;
  let failed = 0;
  for (const user of pending.items) {
    try {
      await deliverAccountWelcome(pb, user.id);
      sent++;
    } catch {
      failed++;
      console.error(`[account] письмо доступа для user ${user.id} остаётся в очереди`);
    }
  }
  return { sent, failed };
}
