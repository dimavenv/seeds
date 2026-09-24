import { beforeEach, expect, it, vi } from "vitest";
import { repairCustomerAccounts } from "@/app/admin/accounts/actions";
import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/pb/server", () => ({ pbAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/auto-account", () => ({ repairPaidAccounts: async () => ({ repaired: 1, failed: 0 }) }));
vi.mock("@/lib/account-welcome", () => ({ retryAccountWelcomes: async () => ({ sent: 0, failed: 0 }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("гость и покупатель не могут массово создавать аккаунты и отправлять письма", async () => {
  vi.mocked(getSession).mockResolvedValue({ isAdmin: false } as never);
  expect(await repairCustomerAccounts()).toMatchObject({ error: true });
  expect(pbAdmin).not.toHaveBeenCalled();
});

it("администратор получает результат восстановления", async () => {
  vi.mocked(getSession).mockResolvedValue({ isAdmin: true } as never);
  expect(await repairCustomerAccounts()).toMatchObject({ error: false });
  expect(pbAdmin).toHaveBeenCalledTimes(1);
});
