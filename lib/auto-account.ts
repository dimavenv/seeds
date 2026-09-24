import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import crypto from "node:crypto";
import type PocketBase from "pocketbase";
import { sendMail, mailLayout, escapeHtml, isMailConfigured } from "@/lib/email";
import { joinFullName, normalizePhone, splitFullName } from "@/lib/profile";
import { createPasswordLink, findAccountByEmail, revokePasswordLink } from "@/lib/password-reset";

// Аккаунт покупателю после подтверждения оплаты (для оплаты при получении —
// после принятия заказа).
//
// Зачем: человек оформил заказ гостем — после первого заказа у него уже есть история
// заказов, кнопка «заказать ещё раз» и адрес с телефоном. Случайный внутренний
// пароль никогда не показывается и не отправляется: покупатель получает
// одноразовую ссылку и сам задаёт пароль.
//
// Правила, за которые не выходим:
//   • онлайн-заказ должен быть оплачен до вызова этой функции;
//   • почта уже занята — аккаунт не трогаем, просто привязываем к нему заказ,
//     чтобы он появился в истории.

// Случайный внутренний пароль нужен только PocketBase при создании auth-записи.
// Он нигде не сохраняется приложением и никогда не отправляется покупателю.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

export function generatePassword(length = PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}

export type AutoAccountResult =
  | { status: "created" }
  | { status: "linked" }
  | { status: "skipped"; reason: string };

export async function ensureAccountForOrder(
  pb: PocketBase,
  o: {
    orderId: string;
    email: string;
    customerName: string;
    phone: string;
    // Заказ уже принадлежит аккаунту — покупатель оформлял его, будучи в системе.
    alreadyLinked: boolean;
  }
): Promise<AutoAccountResult> {
  if (o.alreadyLinked) return { status: "skipped", reason: "заказ уже с аккаунтом" };

  const email = o.email.trim().toLowerCase();
  if (!email) return { status: "skipped", reason: "в заказе нет почты" };

  // Занят ли адрес. Читаем суперпользователем: обычным пользователям список
  // закрыт правилами.
  let existing;
  try {
    existing = await findAccountByEmail(email, pb);
  } catch {
    return { status: "skipped", reason: "база не ответила" };
  }

  if (existing) {
    await linkOrdersByEmail(pb, existing.id, email, o.orderId);
    console.log(`[account] заказ ${o.orderId} связан с существующим user ${existing.id}`);
    return { status: "linked" };
  }

  const fio = splitFullName(o.customerName);
  const password = generatePassword();
  let userId: string;
  try {
    const rec = await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name: joinFullName(fio) || o.customerName.trim(),
      ...fio,
      // Хранится зашифрованным — как и телефон в самом заказе.
      phone: encryptField(normalizePhone(o.phone)) ?? "",
      // Адрес станет подтверждённым после использования ссылки из письма.
      verified: false,
      // Внутренний пароль неизвестен покупателю; войти он сможет после ссылки.
      auto_password: true,
      role: "customer",
    });
    userId = rec.id;
  } catch (e) {
    // Два заказа с одним email могли прийти одновременно. После конфликта
    // уникального индекса повторно ищем победивший аккаунт и привязываем его.
    const raced = await findAccountByEmail(email, pb).catch(() => null);
    if (!raced) {
      console.error(`[account] не удалось создать аккаунт для ${email}:`, e);
      return { status: "skipped", reason: "создать не удалось" };
    }
    await linkOrdersByEmail(pb, raced.id, email, o.orderId);
    return { status: "linked" };
  }

  await linkOrdersByEmail(pb, userId, email, o.orderId);
  console.log(`[account] создан user ${userId}, заказ ${o.orderId} связан`);

  // Почта не участвует в транзакции заказа. Ошибка попадёт в лог, а аккаунт и
  // связь заказа уже останутся сохранены.
  await sendNewAccountEmail(pb, userId, email, o.customerName).catch((error) => {
    console.error(`[account] письмо установки пароля для ${email} не отправлено:`, error);
  });
  return { status: "created" };
}

async function linkOrdersByEmail(
  pb: PocketBase,
  userId: string,
  email: string,
  currentOrderId: string
): Promise<void> {
  // Текущий заказ связываем обязательно, затем подбираем старые гостевые
  // заказы с тем же расшифрованным email, чтобы они появились в кабинете.
  await pb.collection("orders").update(currentOrderId, { user: userId });
  const guests = await pb.collection("orders").getFullList({
    filter: 'user = ""',
    fields: "id,email",
  }).catch((error) => {
    console.error(`[account] старые заказы для ${email} не проверены:`, error);
    return [];
  });
  const normalized = email.toLowerCase();
  await Promise.all(
    guests
      .filter((order) => (decryptField(String(order.email ?? "")) ?? "").trim().toLowerCase() === normalized)
      .map((order) => pb.collection("orders").update(order.id, { user: userId }).catch((error) => {
        console.error(`[account] заказ ${order.id} не привязан к ${email}:`, error);
      }))
  );
}

// Приветственное письмо с одноразовой установкой пароля.
async function sendNewAccountEmail(
  pb: PocketBase,
  userId: string,
  email: string,
  name: string
): Promise<boolean> {
  if (!isMailConfigured()) {
    console.error(`[account] аккаунт ${email} создан, но SMTP не настроен`);
    return false;
  }
  const link = await createPasswordLink(pb, userId, "setup");
  const hello = name ? `${escapeHtml(name.split(/\s+/)[1] || name)}, здравствуйте!` : "Здравствуйте!";
  const sent = await sendMail(
    email,
    "Ваш личный кабинет — Томат Семена",
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Мы создали вам личный кабинет</h1>
      <p style="margin:0 0 14px;">${hello} Спасибо за заказ! Чтобы вы могли
      следить за ним и не вводить данные заново, мы завели вам кабинет на
      <b>tomatsemena.ru</b>.</p>
      <p style="margin:0 0 14px;">
        <a href="${escapeHtml(link.url)}" style="display:inline-block;background:#2e7d32;color:#ffffff;border-radius:10px;padding:11px 22px;font-weight:bold;text-decoration:none;">Создать пароль</a>
      </p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Логин: <b>${escapeHtml(email)}</b>.
      Ссылка одноразовая и действует ограниченное время. Пароль в письме и адресе ссылки
      не передаётся — вы зададите его на защищённой странице.</p>
    `)
  );
  if (!sent) await revokePasswordLink(pb, link.recordId);
  return sent;
}
