import "server-only";
import crypto from "node:crypto";
import { absoluteUrl } from "@/lib/seo";

function secret() {
  const key = process.env.DATA_ENCRYPTION_KEY || process.env.PB_ADMIN_PASSWORD;
  if (!key) throw new Error("Не настроен ключ ссылки продолжения заказа");
  return key;
}
export function createOrderResumeToken(orderId: string): string {
  const body = `${orderId}.${Math.floor(Date.now() / 1000) + 30 * 86400}`;
  return `${body}.${crypto.createHmac("sha256", secret()).update(`order-resume:${body}`).digest("base64url")}`;
}
export function verifyOrderResumeToken(token: string): string | null {
  const match = /^([a-z0-9]{15})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || Number(match[2]) <= Date.now() / 1000) return null;
  const expected = crypto.createHmac("sha256", secret()).update(`order-resume:${match[1]}.${match[2]}`).digest();
  const provided = Buffer.from(match[3], "base64url");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected) ? match[1] : null;
}
export const orderResumeUrl = (id: string) => absoluteUrl(`/order/continue/${createOrderResumeToken(id)}`);
