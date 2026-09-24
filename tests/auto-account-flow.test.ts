import { beforeEach, describe, expect, it } from "vitest";
import type PocketBase from "pocketbase";
import { ensureAccountForOrder } from "@/lib/auto-account";

type Call = { collection: string; method: string; id?: string; data?: Record<string, unknown> };

function fakePb(existingUserId?: string, legacyCase = false) {
  const calls: Call[] = [];
  const pb = {
    filter: (value: string) => value,
    collection: (name: string) => ({
      getList: async () => ({
        items: existingUserId && !legacyCase ? [{ id: existingUserId }] : [],
      }),
      getFullList: async () => name === "users" && existingUserId && legacyCase
        ? [{ id: existingUserId, email: "Example@Mail.Ru" }]
        : [],
      create: async (data: Record<string, unknown>) => {
        calls.push({ collection: name, method: "create", data });
        return { id: name === "users" ? "new-user-id" : "record-id" };
      },
      update: async (id: string, data: Record<string, unknown>) => {
        calls.push({ collection: name, method: "update", id, data });
        return { id };
      },
    }),
  } as unknown as PocketBase;
  return { pb, calls };
}

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
});

describe("аккаунт после первого заказа", () => {
  it("создаёт аккаунт с нормализованным email и связывает заказ", async () => {
    const { pb, calls } = fakePb();
    const result = await ensureAccountForOrder(pb, {
      orderId: "order-1",
      email: " Example@Mail.Ru ",
      customerName: "Иванов Иван",
      phone: "+7 999 111-22-33",
      alreadyLinked: false,
    });

    expect(result).toEqual({ status: "created" });
    const created = calls.find((call) => call.collection === "users" && call.method === "create");
    expect(created?.data?.email).toBe("example@mail.ru");
    expect(created?.data?.verified).toBe(false);
    expect(calls).toContainEqual({
      collection: "orders",
      method: "update",
      id: "order-1",
      data: { user: "new-user-id" },
    });
  });

  it("не создаёт дубль и связывает заказ с существующим аккаунтом", async () => {
    const { pb, calls } = fakePb("existing-user-id");
    const result = await ensureAccountForOrder(pb, {
      orderId: "order-2",
      email: "EXAMPLE@mail.ru",
      customerName: "Иванов Иван",
      phone: "+7 999 111-22-33",
      alreadyLinked: false,
    });

    expect(result).toEqual({ status: "linked" });
    expect(calls.some((call) => call.collection === "users" && call.method === "create")).toBe(false);
    expect(calls).toContainEqual({
      collection: "orders",
      method: "update",
      id: "order-2",
      data: { user: "existing-user-id" },
    });
  });

  it("не трогает заказ, уже связанный с сессией покупателя", async () => {
    const { pb, calls } = fakePb("existing-user-id");
    const result = await ensureAccountForOrder(pb, {
      orderId: "order-3",
      email: "example@mail.ru",
      customerName: "Иванов Иван",
      phone: "+7 999 111-22-33",
      alreadyLinked: true,
    });
    expect(result.status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("находит исторический аккаунт с другим регистром email", async () => {
    const { pb, calls } = fakePb("legacy-user-id", true);
    expect(await ensureAccountForOrder(pb, {
      orderId: "order-4",
      email: "example@mail.ru",
      customerName: "Иванов Иван",
      phone: "",
      alreadyLinked: false,
    })).toEqual({ status: "linked" });
    expect(calls.some((call) => call.collection === "users" && call.method === "create")).toBe(false);
  });
});
