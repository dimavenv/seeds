import { beforeEach, describe, expect, it, vi } from "vitest";
import type PocketBase from "pocketbase";
import { ensureAccountForOrder } from "@/lib/auto-account";
import { sendMail } from "@/lib/email";

vi.mock("@/lib/email", async (original) => ({
  ...await original<typeof import("@/lib/email")>(),
  isMailConfigured: () => true,
  sendMail: vi.fn(async () => true),
}));

const input = {
  orderId: "order-id", email: "Buyer@Example.com", customerName: "Иван",
  phone: "", alreadyLinked: false,
};

function database(existing = false) {
  const create = vi.fn(async (data: Record<string, unknown>) => ({ id: "new-user", ...data }));
  const update = vi.fn(async () => ({}));
  const remove = vi.fn(async () => true);
  const pb = {
    filter: (query: string) => query,
    collection: (name: string) => ({
      getList: async () => ({ items: existing ? [{ id: "existing-user", email: input.email }] : [] }),
      getFullList: async () => [],
      create: name === "users" ? create : async () => ({ id: "token-id" }),
      update,
      delete: remove,
    }),
  } as unknown as PocketBase;
  return { pb, create, update, remove };
}

beforeEach(() => vi.mocked(sendMail).mockReset().mockResolvedValue(true));

describe("письмо доступа после покупки", () => {
  it("новому покупателю отправляет логин и одноразовую ссылку без пароля", async () => {
    const { pb, create } = database();
    expect(await ensureAccountForOrder(pb, input)).toEqual({ status: "created" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const [to, , html] = vi.mocked(sendMail).mock.calls[0];
    expect(to).toBe("buyer@example.com");
    expect(html).toContain("buyer@example.com");
    expect(html).toMatch(/password-reset\?token=[A-Za-z0-9_-]{43}/);
    expect(html).not.toContain(String(create.mock.calls[0][0].password));
  });

  it("существующему аккаунту не отправляет новые данные и не меняет пароль", async () => {
    const { pb, create, update } = database(true);
    expect(await ensureAccountForOrder(pb, input)).toEqual({ status: "linked" });
    expect(create).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith("order-id", { user: "existing-user" });
  });

  it("при отказе SMTP отзывает ссылку, сохраняя аккаунт для восстановления", async () => {
    vi.mocked(sendMail).mockResolvedValue(false);
    const { pb, create, remove } = database();
    expect(await ensureAccountForOrder(pb, input)).toEqual({ status: "created" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("token-id");
  });
});
