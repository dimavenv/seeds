import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Отправка писем магазина (код подтверждения почты, статусы заказов).
// Настройки — в .env.production (см. SETUP-MAIL-RU.md):
//   SMTP_HOST     — smtp.yandex.ru / smtp.mail.ru / свой
//   SMTP_PORT     — 465 (SSL, по умолчанию) или 587 (STARTTLS)
//   SMTP_USER     — логин почтового ящика (обычно сам адрес)
//   SMTP_PASSWORD — пароль приложения (НЕ пароль от почты)
//   MAIL_FROM     — «Томат Семена <info@tomatsemena.ru>» (по умолчанию SMTP_USER)
// Пока переменные не заданы — письма просто не отправляются (isMailConfigured()
// === false), сайт работает как раньше: регистрация без кода, заказы без писем.

export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  );
}

// Транспорты кешируются по логину: кроме основного ящика могут быть отдельные
// (order@, review@, support@ — см. lib/admin-mail.ts), хост/порт у всех общий.
const transports = new Map<string, Transporter>();

function transport(auth: { user: string; pass: string }): Transporter {
  let t = transports.get(auth.user);
  if (!t) {
    const port = Number(process.env.SMTP_PORT || 465);
    t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 — SSL сразу; 587/25 — STARTTLS согласуется сам
      auth: { user: auth.user, pass: auth.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
      // Соединение переиспользуется: каждое новое — это TCP + TLS + AUTH, а
      // почтовые сервисы за частые логины ещё и притормаживают отправителя.
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
    });
    transports.set(auth.user, t);
  }
  return t;
}

// Адрес в угловых скобках из заголовка «От кого» («Имя <a@b.ru>» → «a@b.ru»).
function addressOf(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

// Отправить письмо. Никогда не бросает: ошибки уходят в лог (pm2 logs seeds,
// строки [mail]) — почта не должна ломать оформление заказа или регистрацию.
// opts.auth — отправить с ДРУГОГО ящика того же SMTP-хоста (свой логин/пароль);
// opts.from — заголовок «От кого» (адрес должен принадлежать ящику отправки);
// opts.replyTo — куда пойдёт «Ответить».
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  opts: { from?: string; replyTo?: string; auth?: { user: string; pass: string } } = {}
): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const auth = opts.auth ?? {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASSWORD || "",
  };
  const from =
    opts.from ||
    (opts.auth
      ? `"Томат Семена" <${auth.user}>`
      : process.env.MAIL_FROM || `"Томат Семена" <${process.env.SMTP_USER}>`);
  const startedAt = Date.now();
  try {
    await transport(auth).sendMail({
      from,
      to,
      // Обратный адрес конверта (Return-Path) — ЯЩИК, ИЗ КОТОРОГО реально
      // авторизовались. По нему принимающая сторона проверяет SPF: если в
      // MAIL_FROM стоит адрес одного домена, а логин SMTP от другого,
      // проверка не сходится, и Mail.ru кладёт письмо в спам или придерживает
      // его на несколько минут (серые списки). Заголовок «От кого» при этом
      // остаётся прежним — покупатель видит адрес магазина.
      envelope: { from: addressOf(auth.user || from), to },
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      subject,
      html,
      // Текстовая версия письма: почтовые фильтры хуже относятся к письмам,
      // где есть только HTML.
      text: html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    });
    // Время сдачи письма на SMTP-сервер. Нужно, чтобы отличать «тормозим мы»
    // от «тормозит получатель»: если здесь сотни миллисекунд, а письмо дошло
    // до Mail.ru через десять минут — задержка на их стороне (серые списки,
    // отсутствие SPF/DKIM), и лечится она DNS-записями, а не кодом.
    console.log(`[mail] «${subject}» → ${to} за ${Date.now() - startedAt} мс`);
    return true;
  } catch (e) {
    console.error(`[mail] не отправилось «${subject}» → ${to}: ${(e as Error).message}`);
    return false;
  }
}

// Фирменная обёртка письма: шапка, белая карточка, подвал с контактами.
// Всё инлайн-стилями — почтовые клиенты внешние CSS не понимают.
export function mailLayout(inner: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f0;">
<div style="background:#f1f5f0;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:#2e7d32;border-radius:14px 14px 0 0;padding:18px 28px;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.4px;">🍅 Томат Семена</span>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:28px;border-radius:0 0 14px 14px;color:#26332a;font-size:15px;line-height:1.6;">
        ${inner}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 8px 0;color:#7d8a7d;font-size:12px;line-height:1.5;text-align:center;">
        Магазин коллекционных семян «Томат Семена» ·
        <a href="https://tomatsemena.ru" style="color:#2e7d32;">tomatsemena.ru</a><br>
        Вопросы по заказу: <a href="mailto:info@tomatsemena.ru" style="color:#2e7d32;">info@tomatsemena.ru</a>
      </td>
    </tr>
  </table>
</div>
</body></html>`;
}

// Экранирование пользовательских строк перед вставкой в HTML письма.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
