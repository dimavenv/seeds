import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderResumeToken, verifyOrderResumeToken } from "@/lib/order-resume";
import { emailOrderKey, hasEmailOrder, randomOrderNumber } from "@/lib/order-identity";
import { encryptField } from "@/lib/crypto";
import type PocketBase from "pocketbase";

beforeEach(() => vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32)));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("ссылка продолжения заказа", () => {
  it("подписана, привязана к заказу и не содержит email", () => {
    const id = "a".repeat(15);
    const token = createOrderResumeToken(id);
    expect(verifyOrderResumeToken(token)).toBe(id);
    expect(verifyOrderResumeToken(token.replace(id, "b".repeat(15)))).toBeNull();
    expect(verifyOrderResumeToken("12345")).toBeNull();
  });
  it("перестаёт действовать через 30 дней", () => {
    vi.useFakeTimers();
    const token = createOrderResumeToken("a".repeat(15));
    vi.advanceTimersByTime(31 * 86400000);
    expect(verifyOrderResumeToken(token)).toBeNull();
  });
  it("номер всегда пятизначный без ведущих нулей", () => {
    const values = Array.from({ length: 1000 }, randomOrderNumber);
    expect(values.every((n) => /^[1-9]\d{4}$/.test(String(n)))).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(900);
  });
  it("регистр email не обходит ограничение первого заказа", () => {
    expect(emailOrderKey(" Buyer@Example.com ")).toBe(emailOrderKey("buyer@example.com"));
  });
  it("учитывает исторический заказ без промокода и со шифрованной почтой", async () => {
    const pb = { collection: () => ({ getFullList: async () => [{ id: "old-order", email: encryptField("Buyer@Example.com"), promo_code: "", payment_status: "pending" }] }) } as unknown as PocketBase;
    expect(await hasEmailOrder(pb, "buyer@example.com")).toBe(true);
    expect(await hasEmailOrder(pb, "new@example.com")).toBe(false);
  });
});
