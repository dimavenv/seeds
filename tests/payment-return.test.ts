import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isVerifiedPaidReturn } from "@/lib/payment-return";
import type { OrderRecord } from "@/lib/order-flow";

function order(paymentStatus: OrderRecord["paymentStatus"]): OrderRecord {
  return {
    id: "order-id",
    number: 152,
    invoiceId: 901,
    paymentStatus,
    status: "new",
    total: 4850,
    customerName: "Покупатель",
    email: "",
    phone: "",
    address: "",
    comment: "",
    deliveryMethod: "ozon",
    deliveryCost: 0,
    promoCode: "",
    discount: 0,
    user: "user-id",
    payStartedAt: "",
  };
}

describe("очистка корзины после возврата с оплаты", () => {
  it("разрешена только для оплаченного заказа с тем же счётом и номером", () => {
    expect(isVerifiedPaidReturn(order("paid"), "152", 901)).toBe(true);
    expect(isVerifiedPaidReturn(order("refunded"), "152", 901)).toBe(true);
  });

  it("не доверяет одному параметру paid в URL", () => {
    for (const status of ["pending", "failed", "unpaid"] as const) {
      expect(isVerifiedPaidReturn(order(status), "152", 901)).toBe(false);
    }
    expect(isVerifiedPaidReturn(order("paid"), "999", 901)).toBe(false);
    expect(isVerifiedPaidReturn(order("paid"), "152", 902)).toBe(false);
    expect(isVerifiedPaidReturn(null, "152", 901)).toBe(false);
  });

  it("повторное открытие помечается идентификатором платежа", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "clear-cart-on-paid.tsx"),
      "utf8"
    );
    expect(source).toContain("sc_cart_cleared_payment_${paymentId}");
    expect(source).toContain('localStorage.getItem(marker) === "1"');
    expect(source).toContain("if (!ready || applied.current) return;");
  });
});
