import { sendMail, mailLayout, escapeHtml, isMailConfigured } from "@/lib/email";
import { deliveryMethodLabel } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";

// Служебные уведомления ПРОДАВЦУ: новый заказ, новый отзыв, вопрос в поддержку.
//
// Куда слать — ADMIN_NOTIFY_EMAIL в .env.production (например,
// service@tomatsemena.ru; можно несколько адресов через запятую). Пока
// переменная не задана — уведомления выключены, сайт работает как раньше.
// Пароль от ящика-ПОЛУЧАТЕЛЯ сайту не нужен — он на него только шлёт.
//
// От кого приходят — три варианта, от простого к «паутине»:
// 1) Ничего не настраивать: письма идут с основного ящика (SMTP_USER), но с
//    разным именем отправителя («Заказы · Томат Семена», «Отзывы · …»,
//    «Поддержка · …») — во входящих различимы, фильтры настраиваются легко.
// 2) Отдельные ЯЩИКИ order@/review@/support@ (как у рег.ру): каждому — свой
//    логин и пароль в SMTP_USER_ORDERS/SMTP_PASSWORD_ORDERS,
//    SMTP_USER_REVIEWS/SMTP_PASSWORD_REVIEWS, SMTP_USER_SUPPORT/
//    SMTP_PASSWORD_SUPPORT. Хост и порт общие (SMTP_HOST/SMTP_PORT).
// 3) MAIL_FROM_ORDERS/… — переопределить заголовок «От кого» (нужно, только
//    если адрес — алиас, а не отдельный ящик, или хочется другое имя).
//
// Все функции «тихие»: не бросают, ошибки — в лог (lib/email.ts, строки [mail]).

type Category = "orders" | "reviews" | "support";

const ENV_SUFFIX: Record<Category, string> = {
  orders: "ORDERS",
  reviews: "REVIEWS",
  support: "SUPPORT",
};

const FROM_NAME: Record<Category, string> = {
  orders: "Заказы · Томат Семена",
  reviews: "Отзывы · Томат Семена",
  support: "Поддержка · Томат Семена",
};

function notifyTo(): string | null {
  const raw = (process.env.ADMIN_NOTIFY_EMAIL || "").trim();
  return raw || null;
}

// Отправитель и (если задан) отдельный ящик для категории.
function mailOptsFor(cat: Category): {
  from?: string;
  auth?: { user: string; pass: string };
} {
  const suffix = ENV_SUFFIX[cat];
  const fromOverride = (process.env[`MAIL_FROM_${suffix}`] || "").trim();
  const user = (process.env[`SMTP_USER_${suffix}`] || "").trim();
  const pass = process.env[`SMTP_PASSWORD_${suffix}`] || "";

  // Свой ящик категории: шлём с него, его же ставим в «От кого».
  if (user && pass) {
    return {
      auth: { user, pass },
      from: fromOverride || `"${FROM_NAME[cat]}" <${user}>`,
    };
  }

  // Основной ящик: различаемся именем отправителя (или MAIL_FROM_* если задан).
  if (fromOverride) return { from: fromOverride };
  const base = process.env.MAIL_FROM || process.env.SMTP_USER || "";
  const addr = base.match(/<([^>]+)>/)?.[1] ?? base;
  return addr ? { from: `"${FROM_NAME[cat]}" <${addr}>` } : {};
}

function siteBase(): string {
  return (process.env.SITE_URL || "https://tomatsemena.ru").replace(/\/+$/, "");
}

// Зелёная кнопка-ссылка в админку.
function adminButton(href: string, label: string): string {
  return `<p style="margin:20px 0 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#2e7d32;color:#ffffff;padding:11px 26px;border-radius:999px;font-weight:bold;font-size:14px;text-decoration:none;">${label}</a>
  </p>`;
}

// Серый ярлык категории над заголовком.
function tag(text: string): string {
  return `<div style="margin:0 0 10px;"><span style="display:inline-block;background:#f1f7f1;color:#5c6b5c;font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">${text}</span></div>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 14px;font-size:20px;color:#1d4220;">${text}</h1>`;
}

// Строка «label: value» в карточке данных.
function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#5c6b5c;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#26332a;word-break:break-word;">${value}</td>
  </tr>`;
}

function dataCard(rows: string): string {
  return `<div style="background:#f7faf6;border-radius:12px;padding:14px 16px;margin:14px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%;">${rows}</table>
  </div>`;
}

// «Новый заказ» — состав, сумма, покупатель, кнопка в карточку заказа.
export async function notifyNewOrder(order: {
  id: string; // id записи — для ссылки в админку
  number: number;
  total: number;
  deliveryCost: number;
  deliveryMethod: string | null;
  paid: boolean;
  customer: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    comment?: string | null;
  };
  items: { name: string; price: number; qty: number }[];
}): Promise<void> {
  const to = notifyTo();
  if (!to || !isMailConfigured()) return;

  const itemRows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:7px 0;border-bottom:1px solid #edf2ed;">${escapeHtml(i.name)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #edf2ed;text-align:center;white-space:nowrap;">× ${i.qty}</td>
        <td style="padding:7px 0;border-bottom:1px solid #edf2ed;text-align:right;white-space:nowrap;">${formatPrice(i.price * i.qty)}</td>
      </tr>`
    )
    .join("");

  const c = order.customer;
  const customerRows = [
    row("Имя", escapeHtml(c.name)),
    c.phone ? row("Телефон", `<a href="tel:${escapeHtml(c.phone)}" style="color:#2e7d32;font-weight:bold;">${escapeHtml(c.phone)}</a>`) : "",
    c.email ? row("Почта", `<a href="mailto:${escapeHtml(c.email)}" style="color:#2e7d32;">${escapeHtml(c.email)}</a>`) : "",
    c.address ? row("Адрес", escapeHtml(c.address)) : "",
    c.comment ? row("Комментарий", escapeHtml(c.comment)) : "",
  ].join("");

  const payBadge = order.paid
    ? `<span style="display:inline-block;background:#2e7d32;color:#fff;font-size:12px;font-weight:bold;padding:3px 10px;border-radius:999px;">✓ Оплачен онлайн</span>`
    : `<span style="display:inline-block;background:#fff3e0;color:#b45309;font-size:12px;font-weight:bold;padding:3px 10px;border-radius:999px;">Оплата при получении</span>`;

  await sendMail(
    to,
    `🛒 Новый заказ №${order.number} на ${formatPrice(order.total)}${order.paid ? " — оплачен" : ""}`,
    mailLayout(`
      ${tag("Новый заказ")}
      ${h1(`Заказ №${order.number} · ${formatPrice(order.total)}`)}
      <p style="margin:0 0 14px;">${payBadge}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#26332a;">
        ${itemRows}
        <tr>
          <td style="padding:7px 0;color:#5c6b5c;">Доставка (${escapeHtml(deliveryMethodLabel(order.deliveryMethod ?? ""))})</td>
          <td></td>
          <td style="padding:7px 0;text-align:right;white-space:nowrap;">${order.deliveryCost > 0 ? formatPrice(order.deliveryCost) : "бесплатно"}</td>
        </tr>
        <tr>
          <td style="padding:10px 0 0;font-weight:bold;">Итого</td>
          <td></td>
          <td style="padding:10px 0 0;text-align:right;font-weight:bold;white-space:nowrap;">${formatPrice(order.total)}</td>
        </tr>
      </table>
      ${dataCard(customerRows)}
      ${adminButton(`${siteBase()}/admin/orders/${order.id}`, "Открыть заказ в админке")}
    `),
    { ...mailOptsFor("orders"), ...(c.email ? { replyTo: c.email } : {}) }
  );
}

// «Новый отзыв» — оценка звёздами, текст, кнопка на модерацию.
export async function notifyNewReview(review: {
  author: string;
  rating: number;
  text: string;
  orderNumber?: number | null;
}): Promise<void> {
  const to = notifyTo();
  if (!to || !isMailConfigured()) return;

  const rating = Math.min(5, Math.max(1, Math.round(review.rating)));
  const stars =
    `<span style="color:#f59e0b;font-size:18px;letter-spacing:2px;">${"★".repeat(rating)}</span>` +
    `<span style="color:#d6ddd4;font-size:18px;letter-spacing:2px;">${"☆".repeat(5 - rating)}</span>`;

  await sendMail(
    to,
    `⭐ Новый отзыв ${rating}/5 от ${review.author}`,
    mailLayout(`
      ${tag("Новый отзыв")}
      ${h1(`${escapeHtml(review.author)} оставил${review.orderNumber ? ` отзыв к заказу №${review.orderNumber}` : " отзыв"}`)}
      <p style="margin:0 0 10px;">${stars} <span style="color:#5c6b5c;font-size:13px;">· ${rating} из 5</span></p>
      <div style="background:#f7faf6;border-left:4px solid #2e7d32;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;color:#26332a;white-space:pre-wrap;">${escapeHtml(review.text)}</div>
      <p style="margin:14px 0 0;color:#5c6b5c;font-size:13px;">Отзыв появится на сайте после одобрения в админке.</p>
      ${adminButton(`${siteBase()}/admin/reviews`, "Проверить и опубликовать")}
    `),
    mailOptsFor("reviews")
  );
}

// «Вопрос в поддержке» — тема, текст; «Ответить» в почте пишет сразу покупателю.
export async function notifyNewSupport(req: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const to = notifyTo();
  if (!to || !isMailConfigured()) return;

  await sendMail(
    to,
    `💬 Вопрос в поддержке: ${req.subject}`,
    mailLayout(`
      ${tag("Поддержка")}
      ${h1(escapeHtml(req.subject))}
      ${dataCard(
        row("От кого", escapeHtml(req.name)) +
          row("Почта", `<a href="mailto:${escapeHtml(req.email)}" style="color:#2e7d32;">${escapeHtml(req.email)}</a>`)
      )}
      <div style="margin:14px 0 0;background:#f7faf6;border-left:4px solid #2e7d32;border-radius:0 12px 12px 0;padding:12px 16px;font-size:14px;color:#26332a;white-space:pre-wrap;">${escapeHtml(req.message)}</div>
      <p style="margin:14px 0 0;color:#5c6b5c;font-size:13px;">Нажми «Ответить» — письмо уйдёт сразу покупателю.</p>
      ${adminButton(`${siteBase()}/admin/support`, "Открыть в админке")}
    `),
    {
      ...mailOptsFor("support"),
      replyTo: `"${req.name.replace(/"/g, "")}" <${req.email}>`,
    }
  );
}
