import crypto from "node:crypto";
import type PocketBase from "pocketbase";
import { decryptField } from "@/lib/crypto";

export const FIRST_ORDER_ERROR = "Промокод УРОЖАЙ действует только на первый заказ на эту почту. Продолжите оплату уже созданного заказа по ссылке из письма.";
export const randomOrderNumber = () => crypto.randomInt(10000, 100000);
export const emailOrderKey = (email: string) => crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function hasEmailOrder(pb: PocketBase, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const orders = await pb.collection("orders").getFullList({ fields: "id,email" });
  return orders.some((order) => (decryptField(String(order.email ?? "")) ?? "").trim().toLowerCase() === normalized);
}
