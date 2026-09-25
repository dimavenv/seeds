import "server-only";
import crypto from "node:crypto";
import { absoluteUrl } from "@/lib/seo";

function secret() {
  const key = process.env.DATA_ENCRYPTION_KEY || process.env.PB_ADMIN_PASSWORD;
  if (!key) throw new Error("Не настроен ключ ссылки продолжения заказа");
  return key;
}
export function createOrderResumeToken(orderId: string): string {
  const body = `${orderId}.${Math.floor(Date.now() / 1000) + 86400}`;
  return `${body}.${crypto.createHmac("sha256", secret()).update(`order-resume-24h:${body}`).digest("base64url")}`;
}
export function verifyOrderResumeToken(token: string): string | null {
  const match = /^([a-z0-9]{15})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || Number(match[2]) <= Date.now() / 1000) return null;
  const provided = Buffer.from(match[3], "base64url");
  const signedWith = (context: string) => {
    const expected = crypto.createHmac("sha256", secret()).update(`${context}:${match[1]}.${match[2]}`).digest();
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  };
  if (signedWith("order-resume-24h")) return match[1];
  // Ранее отправленные ссылки имели срок 30 дней. Ограничиваем их теми же
  // 24 часами от выпуска, не заставляя менять уже полученную ссылку.
  if (Number(match[2]) - 29 * 86400 > Date.now() / 1000 && signedWith("order-resume")) return match[1];
  return null;
}
export const orderResumeUrl = (id: string) => absoluteUrl(`/order/continue/${createOrderResumeToken(id)}`);
