import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type PocketBase from "pocketbase";
import { ensureAccountForOrder } from "@/lib/auto-account";
import { sendMail } from "@/lib/email";
import { deliverAccountWelcome } from "@/lib/account-welcome";

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
  let user: Record<string, unknown> = { id: "existing-user", email: input.email };
  const create = vi.fn(async (data: Record<string, unknown>) => {
    user = { id: "new-user", ...data };
    return user;
  });
  const update = vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data }));
  const remove = vi.fn(async () => true);
  const pb = {
    filter: (query: string) => query,
    collection: (name: string) => ({
      getList: async () => ({ items: existing ? [{ id: "existing-user", email: input.email }] : [] }),
      getFullList: async () => [],
      getOne: async () => user,
      create: name === "users" ? create : async () => ({ id: "token-id" }),
      update: async (id: string, data: Record<string, unknown>) => {
        if (name === "users") Object.assign(user, data);
        return update(id, data);
      },
      delete: remove,
    }),
  } as unknown as PocketBase;
  return { pb, create, update, remove };
}

beforeEach(() => {
  vi.mocked(sendMail).mockReset().mockResolvedValue(true);
  vi.stubEnv("DATA_ENCRYPTION_KEY", "ab".repeat(32));
});
afterEach(() => vi.unstubAllEnvs());

describe("письмо доступа после покупки", () => {
  it("новому покупателю отправляет логин и сгенерированный пароль", async () => {
    const { pb, create } = database();
    expect(await ensureAccountForOrder(pb, input)).toEqual({ status: "created" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const [to, , html] = vi.mocked(sendMail).mock.calls[0];
    expect(to).toBe("buyer@example.com");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain(String(create.mock.calls[0][0].password));
    expect(html).toContain("/login");
    expect(html).not.toContain("password-reset?token=");
  });

  it("существующему аккаунту не отправляет новые данные и не меняет пароль", async () => {
    const { pb, create, update } = database(true);
    expect(await ensureAccountForOrder(pb, input)).toEqual({ status: "linked" });
    expect(create).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith("order-id", { user: "existing-user" });
  });

  it("при отказе SMTP сохраняет очередь и повторно отправляет тот же пароль", async () => {
    vi.mocked(sendMail).mockResolvedValue(false);
    const { pb, create } = database();
    await expect(ensureAccountForOrder(pb, input)).rejects.toThrow("очереди");
    expect(create).toHaveBeenCalledTimes(1);
    const user = await pb.collection("users").getOne("new-user");
    expect(user.welcome_credentials).toBeTruthy();
    expect(user.welcome_credentials).not.toContain(String(create.mock.calls[0][0].password));
    vi.mocked(sendMail).mockResolvedValue(true);
    await deliverAccountWelcome(pb, "new-user");
    expect(vi.mocked(sendMail).mock.calls[1][2]).toBe(vi.mocked(sendMail).mock.calls[0][2]);
    expect(user.welcome_credentials).toBe("");
    await deliverAccountWelcome(pb, "new-user");
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("не отправляет старый пароль после смены покупателем", async () => {
    const { pb } = database();
    vi.mocked(sendMail).mockResolvedValue(false);
    await expect(ensureAccountForOrder(pb, input)).rejects.toThrow();
    await pb.collection("users").update("new-user", { auto_password: false });
    vi.mocked(sendMail).mockClear();
    await deliverAccountWelcome(pb, "new-user");
    expect(sendMail).not.toHaveBeenCalled();
    expect((await pb.collection("users").getOne("new-user")).welcome_credentials).toBe("");
  });
});
