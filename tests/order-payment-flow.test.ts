import type PocketBase from "pocketbase";
import { beforeEach, describe, expect, it } from "vitest";
import { failPendingOrder, markOrderPaid, toOrderRecord } from "@/lib/order-flow";

const PRODUCT = "a".repeat(15);

function fakePb(product = PRODUCT) {
  const order: Record<string, unknown> = {
    id: "order-id",
    number: 152,
    invoice_id: 901,
    payment_status: "pending",
    status: "new",
    total: 100,
    user: "user-id",
  };
  const store = {
    id: "store-id",
    cart: [{ id: PRODUCT, qty: 2, price: 100, name: "Томат", slug: "tomat" }],
  };
  let claims = 0;
  const stats = { reserved: 0 };
  const pb = {
    filter: (query: string) => query,
    createBatch: () => {
      const operations: { name: string; data: Record<string, unknown> }[] = [];
      return {
        collection: (name: string) => ({
          create: (data: Record<string, unknown>) => operations.push({ name, data }),
          update: (_id: string, data: Record<string, unknown>) => operations.push({ name, data }),
        }),
        send: async () => {
          if (claims > 0) throw { status: 400 };
          claims++;
          for (const operation of operations) {
            if (operation.name === "orders") Object.assign(order, operation.data);
            if (operation.name === "products") stats.reserved += Number(operation.data["stock-"] ?? 0);
          }
        },
      };
    },
    collection: (name: string) => ({
      getOne: async () => ({ id: "user-id" }),
      getFirstListItem: async () => name === "orders" ? order : store,
      getFullList: async () => name === "order_items"
        ? [{ product, name: "Томат", price: 100, qty: 2 }]
        : [],
      create: async () => {
        if (name === "payment_claims" && claims++) throw { status: 400 };
        return { id: "claim-id" };
      },
      update: async (_id: string, data: Record<string, unknown>) => {
        if (name === "orders") Object.assign(order, data);
        if (name === "user_store") Object.assign(store, data);
        return {};
      },
    }),
  } as unknown as PocketBase;
  return { pb, order, store, stats };
}

beforeEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.ADMIN_NOTIFY_EMAIL;
  delete process.env.ADMIN_NOTIFY_EMAIL_EXTRA;
});

describe("обработка подтверждённой оплаты", () => {
  it("записывает paid и очищает серверную корзину", async () => {
    const { pb, order, store } = fakePb();
    expect(await markOrderPaid(pb, 901)).toMatchObject({ alreadyPaid: false });
    expect(order.payment_status).toBe("paid");
    expect(store.cart).toEqual([]);
  });

  it("повторное подтверждение не вычитает новые товары и не создаёт заказ", async () => {
    const { pb, store } = fakePb();
    await markOrderPaid(pb, 901);
    store.cart = [{ id: PRODUCT, qty: 1, price: 100, name: "Новая покупка", slug: "tomat" }];
    expect(await markOrderPaid(pb, 901)).toMatchObject({ alreadyPaid: true });
    expect(store.cart[0].qty).toBe(1);
  });

  it("незавершённая оплата не очищает корзину", async () => {
    const { pb, order, store } = fakePb("");
    await failPendingOrder(pb, toOrderRecord(order));
    expect(order.payment_status).toBe("failed");
    expect(store.cart[0].qty).toBe(2);
  });

  it("конкурентные подтверждения просроченной оплаты резервируют товар один раз", async () => {
    const { pb, order, store, stats } = fakePb();
    order.payment_status = "failed";
    const results = await Promise.all([markOrderPaid(pb, 901), markOrderPaid(pb, 901)]);
    expect(results.filter((result) => result?.alreadyPaid === false)).toHaveLength(1);
    expect(order.payment_status).toBe("paid");
    expect(stats.reserved).toBe(2);
    expect(store.cart).toEqual([]);
  });
});
