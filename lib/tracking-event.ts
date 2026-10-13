import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function sign(body: string) {
  const key = process.env.DATA_ENCRYPTION_KEY || process.env.PB_ADMIN_PASSWORD;
  if (!key) throw new Error("Не настроен ключ статистики переходов");
  return createHmac("sha256", key).update(`tracking-event-v1:${body}`).digest();
}

export function createTrackingEvent(link: string, channel: "qr" | "link") {
  const body = `${randomBytes(10).toString("hex").slice(0, 15)}.${link}.${channel}.${Math.floor(Date.now() / 1000) + 300}`;
  return `${body}.${sign(body).toString("base64url")}`;
}

export function verifyTrackingEvent(token: string) {
  const m = /^([a-f0-9]{15})\.([a-z0-9]{15})\.(qr|link)\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m || Number(m[4]) <= Date.now() / 1000) return null;
  const body = token.slice(0, token.lastIndexOf("."));
  const signature = Buffer.from(m[5], "base64url");
  const expected = sign(body);
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  return { id: m[1], link: m[2], channel: m[3] };
}
