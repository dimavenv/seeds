import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payment/retry/route";
import { createOrderResumeToken } from "@/lib/order-resume";
import { startPaymentAttempt } from "@/lib/order-flow";
import { verifyCaptcha } from "@/lib/captcha";

vi.mock("@/lib/csrf", () => ({ csrfGuard: () => null }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/email-code", () => ({ allowAttempt: () => true }));
vi.mock("@/lib/captcha", () => ({ verifyCaptcha: vi.fn(async () => false) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: null }) }));
vi.mock("@/lib/pb/server", () => ({ pbAdmin: async () => ({}), hasAdminCredentials: () => true }));
vi.mock("@/lib/pb/shared", () => ({ isDbConfigured: () => true, isValidRecordId: () => true }));
vi.mock("@/lib/order-flow", () => ({ startPaymentAttempt: vi.fn(), orderLines: vi.fn(), findOrderByInvoice: vi.fn(), toOrderRecord: vi.fn() }));
vi.mock("@/lib/robokassa", () => ({ isRobokassaConfigured: () => true, buildRobokassaPayment: vi.fn(), invoiceTtlMinutes: () => 20 }));

beforeEach(() => { vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32)); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
const request = (token: string) => new Request("https://example.com/api/payment/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeToken: token, orderId: "b".repeat(15) }) });

describe("продолжение оплаты по письму", () => {
  it("использует только заказ из подписанной ссылки без входа и капчи", async () => {
    const id = "a".repeat(15);
    vi.mocked(startPaymentAttempt).mockResolvedValue({ ok: false, error: "Заказ уже оплачен", status: 409 });
    expect((await POST(request(createOrderResumeToken(id)))).status).toBe(409);
    expect(startPaymentAttempt).toHaveBeenCalledWith({}, id);
    expect(verifyCaptcha).not.toHaveBeenCalled();
  });
  it("отклоняет поддельную ссылку без выставления счёта", async () => {
    expect((await POST(request("10000"))).status).toBe(403);
    expect(startPaymentAttempt).not.toHaveBeenCalled();
  });
});
