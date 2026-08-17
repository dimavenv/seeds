import "server-only";
import { encryptField } from "@/lib/crypto";
import crypto from "node:crypto";
import type PocketBase from "pocketbase";
import { sendMail, mailLayout, escapeHtml, isMailConfigured } from "@/lib/email";
import { isRussianEmail } from "@/lib/ru-email";
import { joinFullName, normalizePhone, splitFullName } from "@/lib/profile";

// Аккаунт покупателю по оплаченному заказу.
//
// Зачем: человек оформил заказ гостем — а после оплаты у него уже есть история
// заказов, кнопка «заказать ещё раз» и адрес с телефоном, которые не надо
// вводить заново. Пароль сайт придумывает сам и присылает на ту же почту, куда
// уходит чек, — покупателю остаётся только войти и, если хочет, сменить его в
// кабинете.
//
// Правила, за которые не выходим:
//   • только ПОСЛЕ подтверждённой оплаты (вызов живёт в markOrderPaid) —
//     брошенные оформления аккаунтов не плодят;
//   • только если почта настроена: пароль, который некуда отправить, делает
//     аккаунт недоступным;
//   • только российская почта — как и обычная регистрация (см. lib/ru-email);
//   • почта уже занята — аккаунт не трогаем, просто привязываем к нему заказ,
//     чтобы он появился в истории.

// Пароль без похожих друг на друга символов (0/O, 1/l/I): его будут
// перепечатывать с экрана, а не копировать.
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
  if (!isMailConfigured()) {
    return { status: "skipped", reason: "почта не настроена — пароль отправить некуда" };
  }
  if (!isRussianEmail(email)) {
    return { status: "skipped", reason: "почта не российская" };
  }

  // Занят ли адрес. Читаем суперпользователем: обычным пользователям список
  // закрыт правилами.
  const existing = await pb
    .collection("users")
    .getList(1, 1, {
      filter: pb.filter("email = {:e}", { e: email }),
      fields: "id",
    })
    .catch(() => null);
  if (existing === null) {
    return { status: "skipped", reason: "база не ответила" };
  }

  if (existing.items.length > 0) {
    // Аккаунт есть — просто показываем заказ в его истории.
    await pb
      .collection("orders")
      .update(o.orderId, { user: existing.items[0].id })
      .catch(() => {});
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
      // Почта подтверждена делом: на неё ушла оплата и уходит пароль.
      verified: true,
      // Пароль придуман сайтом — в кабинете подскажем заменить его на свой.
      auto_password: true,
      role: "", // покупатель
    });
    userId = rec.id;
  } catch (e) {
    // Не создали (например, кто-то зарегистрировался этой же почтой секунду
    // назад) — заказ останется гостевым, деньги и письма это не затрагивает.
    console.error(`[account] не удалось создать аккаунт для ${email}:`, e);
    return { status: "skipped", reason: "создать не удалось" };
  }

  await pb.collection("orders").update(o.orderId, { user: userId }).catch(() => {});

  const sent = await sendNewAccountEmail(email, o.customerName, password);
  if (!sent) {
    // Письмо не ушло — аккаунт есть, а пароля покупатель не знает. Оставляем
    // аккаунт (в нём заказ) и пишем в лог: восстановление пароля со страницы
    // входа всё равно работает.
    console.error(
      `[account] аккаунт ${email} создан, но письмо с паролем не отправилось — покупателю нужно восстановление пароля`
    );
  }
  return { status: "created" };
}

// Письмо с доступом в кабинет.
async function sendNewAccountEmail(
  email: string,
  name: string,
  password: string
): Promise<boolean> {
  const hello = name ? `${escapeHtml(name.split(/\s+/)[1] || name)}, здравствуйте!` : "Здравствуйте!";
  return sendMail(
    email,
    "Ваш личный кабинет — Томат Семена",
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Мы создали вам личный кабинет</h1>
      <p style="margin:0 0 14px;">${hello} Заказ оплачен — спасибо! Чтобы вы могли
      следить за ним и не вводить данные заново, мы завели вам кабинет на
      <b>tomatsemena.ru</b>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f1f7f1;border-radius:12px;">
        <tr><td style="padding:16px 18px;font-size:15px;color:#26332a;">
          Логин: <b>${escapeHtml(email)}</b><br>
          Пароль: <b style="font-family:Consolas,Menlo,monospace;font-size:17px;letter-spacing:1px;">${escapeHtml(password)}</b>
        </td></tr>
      </table>
      <p style="margin:0 0 14px;">
        <a href="https://tomatsemena.ru/login" style="display:inline-block;background:#2e7d32;color:#ffffff;border-radius:10px;padding:11px 22px;font-weight:bold;text-decoration:none;">Войти в кабинет</a>
      </p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Пароль можно поменять на
      свой в кабинете, раздел «Безопасность». Никому не пересылайте это письмо —
      по этим данным входят в ваш аккаунт.</p>
      <p style="margin:14px 0 0;color:#5c6b5c;font-size:13px;">Письмо потерялось?
      Пароль всегда можно
      <a href="https://tomatsemena.ru/password-reset" style="color:#2e7d32;">сменить по коду с почты</a>.</p>
    `)
  );
}
