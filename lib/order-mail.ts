import { sendMail, mailLayout, escapeHtml, isMailConfigured } from "@/lib/email";
import { deliveryMethodLabel } from "@/lib/delivery";
import { formatPrice } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

// Письма покупателю о заказе. Работают и для гостей: почта берётся из формы
// оформления, аккаунт не нужен. Все функции «тихие»: без настроенного SMTP или
// без почты в заказе просто ничего не делают, ошибки — в лог (lib/email.ts).

type OrderInfo = {
  to: string | null | undefined;
  number: number;
  name?: string | null;
};

function hello(name?: string | null): string {
  return name ? `${escapeHtml(name)}, здравствуйте!` : "Здравствуйте!";
}

function orderTitle(n: number, text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Заказ №${n}: ${text}</h1>`;
}

function note(text: string): string {
  return `<p style="margin:14px 0 0;color:#5c6b5c;font-size:13px;">${text}</p>`;
}

async function send(o: OrderInfo, subject: string, inner: string): Promise<void> {
  if (!o.to || !isMailConfigured()) return;
  await sendMail(o.to, `${subject} — заказ №${o.number}, Томат Семена`, mailLayout(inner));
}

// «Заказ принят» — сразу после оформления, с составом и суммой.
export async function mailOrderPlaced(
  o: OrderInfo,
  items: { name: string; price: number; qty: number }[],
  totals: { total: number; deliveryCost: number; deliveryMethod: string }
): Promise<void> {
  const rows = items
    .map(
      (i) => `<tr>
        <td style="padding:7px 0;border-bottom:1px solid #edf2ed;">${escapeHtml(i.name)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #edf2ed;text-align:center;white-space:nowrap;">× ${i.qty}</td>
        <td style="padding:7px 0;border-bottom:1px solid #edf2ed;text-align:right;white-space:nowrap;">${formatPrice(i.price * i.qty)}</td>
      </tr>`
    )
    .join("");

  await send(
    o,
    "Принят",
    `${orderTitle(o.number, "принят")}
    <p style="margin:0 0 16px;">${hello(o.name)} Спасибо за заказ — мы получили
    его и скоро свяжемся с вами для подтверждения.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#26332a;">
      ${rows}
      <tr>
        <td style="padding:7px 0;color:#5c6b5c;">Доставка (${escapeHtml(deliveryMethodLabel(totals.deliveryMethod))})</td>
        <td></td>
        <td style="padding:7px 0;text-align:right;white-space:nowrap;">${totals.deliveryCost > 0 ? formatPrice(totals.deliveryCost) : "бесплатно"}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-weight:bold;">Итого</td>
        <td></td>
        <td style="padding:10px 0 0;text-align:right;font-weight:bold;white-space:nowrap;">${formatPrice(totals.total)}</td>
      </tr>
    </table>
    ${note("Мы будем присылать письма при каждом изменении статуса заказа — вы ничего не пропустите.")}`
  );
}

// «Оплата получена» / «Возврат оформлен» — из callback банка и админки.
export async function mailPayment(
  o: OrderInfo,
  kind: "paid" | "refunded",
  total?: number,
  items?: { name: string; price: number; qty: number }[]
): Promise<void> {
  if (kind === "paid") {
    const rows = (items ?? [])
      .map(
        (i) => `<tr>
          <td style="padding:7px 0;border-bottom:1px solid #edf2ed;">${escapeHtml(i.name)}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #edf2ed;text-align:center;white-space:nowrap;">× ${i.qty}</td>
          <td style="padding:7px 0;border-bottom:1px solid #edf2ed;text-align:right;white-space:nowrap;">${formatPrice(i.price * i.qty)}</td>
        </tr>`
      )
      .join("");
    await send(
      o,
      "Оплата получена",
      `${orderTitle(o.number, "оплата получена")}
      <p style="margin:0 0 ${rows ? "16px" : "0"};">${hello(o.name)} Мы получили вашу оплату${
        total ? ` на сумму <b>${formatPrice(total)}</b>` : ""
      }. Заказ передан в сборку — о смене статуса сообщим письмом.</p>
      ${
        rows
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#26332a;">${rows}</table>`
          : ""
      }
      ${note("Кассовый чек придёт отдельным письмом.")}`
    );
  } else {
    await send(
      o,
      "Возврат оформлен",
      `${orderTitle(o.number, "возврат оформлен")}
      <p style="margin:0;">${hello(o.name)} Мы оформили возврат оплаты по вашему
      заказу. Деньги вернутся на карту, обычно это занимает от 1 до 10 дней —
      зависит от банка.</p>`
    );
  }
}

// Изменение статуса заказа из админки.
export async function mailOrderStatus(
  o: OrderInfo,
  status: OrderStatus,
  extra: { tracking?: string | null; deliveryMethod?: string | null } = {}
): Promise<void> {
  switch (status) {
    case "processing":
      await send(
        o,
        "В обработке",
        `${orderTitle(o.number, "в обработке")}
        <p style="margin:0;">${hello(o.name)} Мы подтвердили ваш заказ и начали
        собирать его. Как только передадим в доставку — сообщим и пришлём
        трек-номер.</p>`
      );
      return;
    case "shipped": {
      const track = extra.tracking?.trim();
      const method = extra.deliveryMethod
        ? ` (${escapeHtml(deliveryMethodLabel(extra.deliveryMethod))})`
        : "";
      await send(
        o,
        "Отправлен",
        `${orderTitle(o.number, "отправлен")}
        <p style="margin:0 0 14px;">${hello(o.name)} Ваш заказ передан в доставку${method}.</p>
        ${
          track
            ? `<div style="padding:14px;background:#f1f7f1;border-radius:12px;text-align:center;">
                 <div style="font-size:12px;color:#5c6b5c;margin-bottom:4px;">Трек-номер для отслеживания</div>
                 <div style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#1d4220;">${escapeHtml(track)}</div>
               </div>`
            : note("Трек-номер пришлём отдельным письмом, как только он появится.")
        }`
      );
      return;
    }
    case "done":
      await send(
        o,
        "Выполнен",
        `${orderTitle(o.number, "выполнен")}
        <p style="margin:0;">${hello(o.name)} Заказ доставлен — надеемся, всё
        отлично! Будем очень рады отзыву:
        <a href="https://tomatsemena.ru/reviews" style="color:#2e7d32;font-weight:bold;">оставить отзыв</a>.
        Хороших урожаев! 🍅</p>`
      );
      return;
    case "cancelled":
      await send(
        o,
        "Отменён",
        `${orderTitle(o.number, "отменён")}
        <p style="margin:0;">${hello(o.name)} Ваш заказ отменён. Если вы
        оплачивали его онлайн — деньги вернутся на карту (обычно 1–10 дней).
        Если отмена стала неожиданностью, напишите нам:
        <a href="mailto:info@tomatsemena.ru" style="color:#2e7d32;">info@tomatsemena.ru</a>.</p>`
      );
      return;
    default:
      // «new» покрыт письмом «заказ принят».
      return;
  }
}

// Отдельное письмо с трек-номером — когда трек вписали уже после отправки.
export async function mailTracking(
  o: OrderInfo,
  tracking: string,
  deliveryMethod?: string | null
): Promise<void> {
  await send(
    o,
    "Трек-номер",
    `${orderTitle(o.number, "трек-номер для отслеживания")}
    <p style="margin:0 0 14px;">${hello(o.name)} Посылку можно отследить по номеру${
      deliveryMethod ? ` (${escapeHtml(deliveryMethodLabel(deliveryMethod))})` : ""
    }:</p>
    <div style="padding:14px;background:#f1f7f1;border-radius:12px;text-align:center;">
      <div style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#1d4220;">${escapeHtml(tracking)}</div>
    </div>`
  );
}
