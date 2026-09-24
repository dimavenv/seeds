import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import crypto from "node:crypto";
import type PocketBase from "pocketbase";
import { joinFullName, normalizePhone, splitFullName } from "@/lib/profile";
import { findAccountByEmail } from "@/lib/password-reset";
import { deliverAccountWelcome, sealWelcomePassword } from "@/lib/account-welcome";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 14): string {
  return Array.from({ length }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
}

export type AutoAccountResult =
  | { status: "created" }
  | { status: "linked" }
  | { status: "skipped"; reason: string };

// Вызывается после оплаты (либо принятия заказа с оплатой при получении).
// Ошибки не маскируются под успех: обработчик платежа/cron повторит операцию.
export async function ensureAccountForOrder(
  pb: PocketBase,
  o: { orderId: string; email: string; customerName: string; phone: string; alreadyLinked: boolean }
): Promise<AutoAccountResult> {
  if (o.alreadyLinked) return { status: "skipped", reason: "заказ уже с аккаунтом" };
  const email = o.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Заказ ${o.orderId}: email отсутствует или не расшифрован`);
  }
  const existing = await findAccountByEmail(email, pb);
  if (existing) {
    await linkOrdersByEmail(pb, existing.id, email, o.orderId);
    await deliverAccountWelcome(pb, existing.id);
    return { status: "linked" };
  }

  const fio = splitFullName(o.customerName);
  const password = generatePassword();
  // Шифротекст и пользователь сохраняются одним create: сбой SMTP/процесса
  // не потеряет пароль. Существующие пароли никогда не меняем.
  const pending = sealWelcomePassword(password);
  let userId: string;
  try {
    const user = await pb.collection("users").create({
      email, password, passwordConfirm: password,
      name: joinFullName(fio) || o.customerName.trim(), ...fio,
      phone: encryptField(normalizePhone(o.phone)) ?? "",
      verified: false, auto_password: true, role: "customer",
      welcome_credentials: pending,
    });
    userId = user.id;
  } catch (error) {
    const raced = await findAccountByEmail(email, pb);
    if (!raced) {
      // Не выводим объект запроса: в нём может содержаться пароль.
      const response = (error as { response?: { data?: Record<string, unknown> } }).response;
      throw new Error(`Заказ ${o.orderId}: аккаунт не создан; поля: ${Object.keys(response?.data ?? {}).join(",") || "ошибка базы"}`);
    }
    await linkOrdersByEmail(pb, raced.id, email, o.orderId);
    await deliverAccountWelcome(pb, raced.id);
    return { status: "linked" };
  }
  await linkOrdersByEmail(pb, userId, email, o.orderId);
  await deliverAccountWelcome(pb, userId);
  console.log(`[account] создан user ${userId}, заказ ${o.orderId} связан`);
  return { status: "created" };
}

async function linkOrdersByEmail(pb: PocketBase, userId: string, email: string, currentOrderId: string): Promise<void> {
  await pb.collection("orders").update(currentOrderId, { user: userId });
  const guests = await pb.collection("orders").getFullList({
    filter: 'user = ""', fields: "id,email",
  });
  for (const order of guests) {
    if ((decryptField(String(order.email ?? "")) ?? "").trim().toLowerCase() === email) {
      await pb.collection("orders").update(order.id, { user: userId });
    }
  }
}

// Восстанавливает оплаченные гостевые заказы, пропущенные старым кодом.
export async function repairPaidAccounts(pb: PocketBase): Promise<{ repaired: number; failed: number }> {
  const orders = await pb.collection("orders").getList(1, 50, {
    filter: 'payment_status = "paid" && user = ""', sort: "placed_at",
  });
  let repaired = 0;
  let failed = 0;
  for (const order of orders.items) {
    try {
      await ensureAccountForOrder(pb, {
        orderId: order.id, email: decryptField(String(order.email ?? "")) ?? "",
        customerName: String(order.customer_name ?? ""),
        phone: decryptField(String(order.phone ?? "")) ?? "", alreadyLinked: false,
      });
      repaired++;
    } catch (error) {
      failed++;
      console.error(`[account] восстановление заказа ${order.id}: ${(error as Error).message}`);
    }
  }
  return { repaired, failed };
}
