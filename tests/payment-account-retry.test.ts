import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/payment/callback/route";
import { findOrderByInvoice, markOrderPaid } from "@/lib/order-flow";

vi.mock("@/lib/pb/server", () => ({ pbAdmin: async () => ({}) }));
vi.mock("@/lib/order-flow", () => ({ findOrderByInvoice: vi.fn(), markOrderPaid: vi.fn() }));
vi.mock("@/lib/robokassa", () => ({
  isRobokassaConfigured: () => true,
  checkResultNotification: () => ({ ok: true, invId: 100, outSum: 100 }),
  paramsToObject: () => ({}),
  robokassaOpState: vi.fn(), isPaidState: () => true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findOrderByInvoice).mockResolvedValue({ paymentStatus: "paid", total: 100 } as never);
  vi.mocked(markOrderPaid).mockResolvedValue({ order: { id: "order", number: 1 }, alreadyPaid: true });
});

describe("повторное уведомление об оплате", () => {
  it("для paid завершает доставку аккаунта до ответа OK", async () => {
    const response = await GET(new Request("https://example.com/api/payment/callback"));
    expect(markOrderPaid).toHaveBeenCalledWith({}, 100);
    expect(await response.text()).toBe("OK100");
  });
  it("возвращает 503 при сбое создания/доставки, чтобы уведомление повторилось", async () => {
    vi.mocked(markOrderPaid).mockRejectedValue(new Error("SMTP temporarily unavailable"));
    expect((await GET(new Request("https://example.com/api/payment/callback"))).status).toBe(503);
  });
  it("не обрабатывает даже оплаченный заказ при несовпадении суммы", async () => {
    vi.mocked(findOrderByInvoice).mockResolvedValue({ paymentStatus: "paid", total: 200 } as never);
    expect((await GET(new Request("https://example.com/api/payment/callback"))).status).toBe(400);
    expect(markOrderPaid).not.toHaveBeenCalled();
  });
});
