// Клиент платёжного сервиса Robokassa.
// Документация: docs.robokassa.ru (интерфейс оплаты, уведомления и
// переадресация, XML-интерфейсы, фискализация).
//
// Как это устроено:
//   1. При оформлении заказа сайт НЕ ходит в Robokassa — он подписывает
//      параметры своим Паролем#1 и отдаёт браузеру данные POST-формы на
//      https://auth.robokassa.ru/Merchant/Index.aspx (см. /api/checkout).
//   2. После оплаты Robokassa дёргает Result URL (/api/payment/callback) —
//      там подпись проверяется Паролем#2, и заказ помечается оплаченным.
//   3. Покупателя возвращают на Success URL (/payment/success) — там подпись
//      проверяется Паролем#1 (Success URL приходит от браузера, доверять ему
//      без подписи нельзя).
//   4. Статус платежа можно спросить у Robokassa напрямую (XML OpStateExt) —
//      этим пользуются уборка зависших заказов и /api/payment/status.
//
// ВАЖНО: суммы у Robokassa — в РУБЛЯХ строкой с двумя знаками ("1234.50"),
// в отличие от копеек у большинства эквайрингов. Значение в подписи обязано
// посимвольно совпадать со значением в запросе.
//
// Переменные окружения (.env.production) — см. SETUP-PAYMENTS-RU.md:
//   ROBOKASSA_LOGIN         — идентификатор магазина (MerchantLogin)
//   ROBOKASSA_PASSWORD1     — Пароль#1 (подпись исходящих запросов)
//   ROBOKASSA_PASSWORD2     — Пароль#2 (проверка уведомлений)
//   ROBOKASSA_TEST          — 1/true: тестовый режим (IsTest=1)
//   ROBOKASSA_TEST_PASSWORD1/2 — тестовые пароли (если заданы, в тестовом
//                             режиме используются вместо боевых)
//   ROBOKASSA_HASH          — алгоритм хеша из технастроек: md5 (по умолчанию),
//                             sha1, sha256, sha384, sha512, ripemd160
//   ROBOKASSA_RECEIPT       — on: слать фискальный чек (Receipt)
//   ROBOKASSA_SNO           — система налогообложения для чека (usn_income и т.п.)
//   ROBOKASSA_TAX           — ставка НДС в чеке (none по умолчанию)
//   ROBOKASSA_PAYMENT_METHOD— признак способа расчёта (full_prepayment)
//   ROBOKASSA_PAYMENT_OBJECT— признак предмета расчёта товаров (commodity)
//   ROBOKASSA_RECEIPT_ENCODE— url (по умолчанию) | raw — как чек попадает в подпись
//   ROBOKASSA_INVOICE_TTL_MIN — срок жизни счёта, мин (0 — не ограничивать)

import "server-only";
import crypto from "node:crypto";

export const ROBOKASSA_PAY_URL =
  "https://auth.robokassa.ru/Merchant/Index.aspx";

const OP_STATE_URL =
  "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";

// Все значения читаются в момент вызова, а не при импорте модуля: так
// standalone-сборка Next видит актуальный .env.production, а тесты могут
// подменять окружение без перезагрузки модуля.
const env = (name: string): string => (process.env[name] || "").trim();

export function isRobokassaTest(): boolean {
  const v = env("ROBOKASSA_TEST").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// В тестовом режиме Robokassa считает подписи ТЕСТОВЫМИ паролями (они не
// совпадают с боевыми). Если тестовые пароли не заданы отдельно — считаем,
// что в ROBOKASSA_PASSWORD1/2 уже лежат тестовые.
//
// Пароль#3 — отдельная история: это ключ Refund API (возвраты по операции),
// тестового аналога у него нет, поэтому он всегда берётся как есть.
export function robokassaPassword(which: 1 | 2 | 3): string {
  if (which === 3) return env("ROBOKASSA_PASSWORD3");
  const test = env(`ROBOKASSA_TEST_PASSWORD${which}`);
  if (isRobokassaTest() && test) return test;
  return env(`ROBOKASSA_PASSWORD${which}`);
}

export function robokassaLogin(): string {
  return env("ROBOKASSA_LOGIN");
}

// Оплата включается только когда есть всё: логин, Пароль#1 (подписать счёт) и
// Пароль#2 (проверить уведомление об оплате). Без Пароля#2 сайт не смог бы
// отличить настоящее уведомление от подделки — такую оплату не включаем.
export function isRobokassaConfigured(): boolean {
  return Boolean(
    robokassaLogin() && robokassaPassword(1) && robokassaPassword(2)
  );
}

const HASH_ALGOS = new Set([
  "md5",
  "sha1",
  "sha256",
  "sha384",
  "sha512",
  "ripemd160",
]);

// Алгоритм должен совпадать с выбранным в технастройках магазина.
export function robokassaHashAlgo(): string {
  const raw = env("ROBOKASSA_HASH").toLowerCase().replace(/[-_\s]/g, "");
  return HASH_ALGOS.has(raw) ? raw : "md5";
}

export function robokassaHash(data: string): string {
  return crypto
    .createHash(robokassaHashAlgo())
    .update(data, "utf8")
    .digest("hex")
    .toUpperCase();
}

// Сравнение подписей: без учёта регистра (Robokassa допускает любой) и без
// ранних выходов по первому несовпавшему символу.
function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toUpperCase());
  const y = Buffer.from(b.trim().toUpperCase());
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Сумма для Robokassa: рубли с двумя знаками. Именно эта строка идёт и в
// подпись, и в запрос — расхождение хотя бы в одном символе даст «неверную
// подпись» на стороне Robokassa.
export function formatOutSum(rubles: number): string {
  return (Math.round(rubles * 100) / 100).toFixed(2);
}

// Пользовательские параметры Shp_*: в подпись идут отсортированными по имени
// в виде «:Shp_имя=значение» и всегда ПОСЛЕ пароля. Сейчас сайт их не шлёт
// (номер заказа = InvId достаточно), но проверка уведомлений обязана их
// учитывать — иначе подпись не сойдётся, если параметры появятся позже.
function shpSuffix(params: Record<string, string>): string {
  const shp = Object.keys(params)
    .filter((k) => /^shp_/i.test(k))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return shp.map((k) => `:${k}=${params[k]}`).join("");
}

export type ReceiptItem = {
  name: string;
  quantity: number;
  sum: number;
  tax: string;
  payment_method: string;
  payment_object: string;
};

export type ReceiptLine = { name: string; price: number; qty: number };

// Позиции фискального чека. Сумма позиций ОБЯЗАНА совпадать с OutSum до
// копейки, поэтому скидка по промокоду размазывается по товарам (Robokassa
// отдельной «скидочной» позиции не принимает), а остаток от округления
// добавляется к самой дорогой позиции.
export function buildReceiptItems(o: {
  lines: ReceiptLine[];
  deliveryCost?: number;
  discount?: number;
  tax?: string;
  // Итог заказа. Если передан — расхождение округлений «дотягивается» до него,
  // чтобы чек не разошёлся с суммой платежа даже на копейку.
  total?: number;
}): ReceiptItem[] {
  const tax = o.tax || env("ROBOKASSA_TAX") || "none";
  // Признак способа расчёта. Для интернет-магазина с доставкой это ПОЛНАЯ
  // ПРЕДОПЛАТА: деньги получены сейчас, товар уедет позже. То же значение
  // выбирается в ЛК Robokassa («Метод платежа» в Робочеках) — они должны
  // совпадать, иначе чек уйдёт с неверным признаком.
  const paymentMethod = env("ROBOKASSA_PAYMENT_METHOD") || "full_prepayment";
  const paymentObject = env("ROBOKASSA_PAYMENT_OBJECT") || "commodity";
  const lines = o.lines.filter((l) => l.qty > 0);

  // Считаем в копейках — на float'ах чек не сойдётся с суммой платежа.
  const lineKop = lines.map((l) => Math.round(l.price * 100) * l.qty);
  const goodsKop = lineKop.reduce((s, k) => s + k, 0);
  const discountKop = Math.min(
    Math.max(0, Math.round((o.discount ?? 0) * 100)),
    goodsKop
  );
  const payableKop = goodsKop - discountKop;

  const paidKop = lineKop.map((k) =>
    goodsKop > 0 ? Math.floor((k * payableKop) / goodsKop) : 0
  );
  // Остаток после округления вниз (не больше числа позиций) раздаём по одной
  // копейке, начиная с самых дорогих позиций.
  let rest = payableKop - paidKop.reduce((s, k) => s + k, 0);
  const byPrice = paidKop
    .map((_, i) => i)
    .sort((a, b) => lineKop[b] - lineKop[a]);
  for (let i = 0; rest > 0 && byPrice.length > 0; i = (i + 1) % byPrice.length) {
    paidKop[byPrice[i]] += 1;
    rest -= 1;
  }

  const items: ReceiptItem[] = lines.map((l, i) => ({
    name: l.name.slice(0, 128),
    quantity: l.qty,
    sum: Math.round(paidKop[i]) / 100,
    tax,
    payment_method: paymentMethod,
    payment_object: paymentObject,
  }));

  const deliveryKop = Math.round((o.deliveryCost ?? 0) * 100);
  if (deliveryKop > 0) {
    items.push({
      name: "Доставка",
      quantity: 1,
      sum: deliveryKop / 100,
      tax,
      payment_method: paymentMethod,
      // Доставка — услуга, а не товар: этого требует номенклатура в чеке.
      payment_object: "service",
    });
  }

  // Последняя страховка: сумма чека обязана совпасть с суммой платежа. Если
  // итог заказа посчитан хоть немного иначе (цена с копейками, своё
  // округление скидки), разницу добавляем к самой крупной позиции.
  if (typeof o.total === "number" && items.length > 0) {
    const wantKop = Math.round(o.total * 100);
    const haveKop = items.reduce((s, i) => s + Math.round(i.sum * 100), 0);
    const diff = wantKop - haveKop;
    if (diff !== 0) {
      let biggest = 0;
      for (let i = 1; i < items.length; i++) {
        if (items[i].sum > items[biggest].sum) biggest = i;
      }
      items[biggest].sum =
        Math.round(items[biggest].sum * 100 + diff) / 100;
    }
  }
  return items;
}

export function isReceiptEnabled(): boolean {
  const v = env("ROBOKASSA_RECEIPT").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// Чек JSON. sno (система налогообложения) обязателен, если у магазина в
// Robokassa включено несколько систем; при одной — можно не слать.
export function buildReceiptJson(o: {
  lines: ReceiptLine[];
  deliveryCost?: number;
  discount?: number;
  total?: number;
}): string {
  const sno = env("ROBOKASSA_SNO");
  const receipt: Record<string, unknown> = {
    ...(sno ? { sno } : {}),
    items: buildReceiptItems(o),
  };
  return JSON.stringify(receipt);
}

// Как чек попадает в подпись и в поле запроса. Документация говорит только
// одно: «перед добавлением в строку для подписи значение Receipt нужно
// URL-кодировать», а про само поле умалчивает — поэтому у магазинов встречаются
// все четыре сочетания. Значения ROBOKASSA_RECEIPT_ENCODE:
//   both  (по умолчанию) — кодированы и подпись, и поле. Это же объясняет
//                          известное «для GET чек кодируется дважды»: один раз
//                          сам чек, второй — при сборке строки запроса;
//   sign  — кодирована только подпись, в поле уходит исходный JSON;
//   field — кодировано только поле, в подписи исходный JSON (так делает
//           популярный неофициальный SDK);
//   raw   — нигде не кодируется.
// Подобрать нужное вручную не надо: `npm run check:pay` перебирает все четыре
// и говорит, какое принимает Robokassa.
export type ReceiptEncoding = { field: string; signature: string };

export const RECEIPT_ENCODINGS = ["both", "sign", "field", "raw"] as const;
export type ReceiptEncodeMode = (typeof RECEIPT_ENCODINGS)[number];

export function encodeReceiptValue(
  json: string,
  mode: string
): ReceiptEncoding {
  const encoded = encodeURIComponent(json);
  switch (mode.toLowerCase()) {
    case "raw":
      return { field: json, signature: json };
    case "sign":
      return { field: json, signature: encoded };
    // «url» — прежнее имя этого режима, оставлено для совместимости.
    case "field":
    case "url":
      return { field: encoded, signature: json };
    default:
      return { field: encoded, signature: encoded };
  }
}

function encodeReceipt(json: string): ReceiptEncoding {
  return encodeReceiptValue(json, env("ROBOKASSA_RECEIPT_ENCODE"));
}

// Срок жизни счёта. Нужен, чтобы покупатель не оплатил заказ, который сайт уже
// удалил как зависший (см. lib/order-cleanup.ts): счёт протухает раньше уборки.
export function invoiceTtlMinutes(): number {
  const raw = env("ROBOKASSA_INVOICE_TTL_MIN");
  if (raw === "") return 20;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20;
}

// ExpirationDate в формате ISO 8601 с явным смещением: документация приводит
// пример вида 2030-12-30T22:00:00.000+03:00, «Z» лучше не слать.
export function formatExpirationDate(d: Date, offsetMinutes = 180): string {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
      shifted.getUTCDate()
    )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(
      shifted.getUTCSeconds()
    )}.${pad(shifted.getUTCMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export type RobokassaPayment = {
  // Куда отправлять форму и что в ней лежит. Именно POST-форма, а не ссылка:
  // чек с номенклатурой не влезает в лимит длины URL, а параметры платежа не
  // светятся в истории браузера и в Referer.
  url: string;
  fields: Record<string, string>;
};

// Параметры платёжной формы вместе с подписью.
// Строка подписи: MerchantLogin:OutSum:InvId[:Receipt]:Пароль#1[:Shp_...]
export function buildRobokassaPayment(o: {
  invId: number;
  amount: number;
  description: string;
  email?: string | null;
  // Состав заказа для фискального чека (если чек включён).
  lines?: ReceiptLine[];
  deliveryCost?: number;
  discount?: number;
  expiresAt?: Date | null;
}): RobokassaPayment {
  const login = robokassaLogin();
  const outSum = formatOutSum(o.amount);
  const invId = String(Math.round(o.invId));

  const receipt =
    isReceiptEnabled() && o.lines && o.lines.length > 0
      ? encodeReceipt(
          buildReceiptJson({
            lines: o.lines,
            deliveryCost: o.deliveryCost,
            discount: o.discount,
            // Чек считается от той же суммы, что уходит в OutSum.
            total: Math.round(o.amount * 100) / 100,
          })
        )
      : null;

  const signature = robokassaHash(
    [
      login,
      outSum,
      invId,
      ...(receipt ? [receipt.signature] : []),
      robokassaPassword(1),
    ].join(":")
  );

  const fields: Record<string, string> = {
    MerchantLogin: login,
    OutSum: outSum,
    InvId: invId,
    // Описание видно покупателю на платёжной странице; лимит — 100 символов.
    Description: o.description.slice(0, 100),
    SignatureValue: signature,
    Culture: "ru",
    Encoding: "utf-8",
  };
  if (receipt) fields.Receipt = receipt.field;
  if (o.email) fields.Email = o.email;
  if (o.expiresAt) fields.ExpirationDate = formatExpirationDate(o.expiresAt);
  if (isRobokassaTest()) fields.IsTest = "1";

  return { url: ROBOKASSA_PAY_URL, fields };
}

// Приведение параметров уведомления к обычному объекту: Robokassa шлёт их
// формой (POST) или строкой запроса (GET), регистр имён у некоторых магазинов
// отличается (OutSum/outSum), поэтому ищем без учёта регистра.
export function paramsToObject(
  src: URLSearchParams | FormData | Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (src instanceof URLSearchParams) {
    src.forEach((v, k) => (out[k] = v));
  } else if (typeof FormData !== "undefined" && src instanceof FormData) {
    src.forEach((v, k) => {
      if (typeof v === "string") out[k] = v;
    });
  } else {
    Object.assign(out, src);
  }
  return out;
}

export function pick(
  params: Record<string, string>,
  name: string
): string | undefined {
  const key = Object.keys(params).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  return key === undefined ? undefined : params[key];
}

export type NotificationCheck =
  | { ok: true; invId: number; outSum: number }
  | { ok: false; reason: string };

// Общая проверка уведомления: подпись считается от суммы, номера счёта и
// пароля (#2 — для Result URL, #1 — для Success URL) плюс Shp_-параметры.
function checkNotification(
  params: Record<string, string>,
  password: string
): NotificationCheck {
  const outSum = pick(params, "OutSum") ?? "";
  const invIdRaw = pick(params, "InvId") ?? "";
  const received = pick(params, "SignatureValue") ?? "";
  if (!outSum || !invIdRaw || !received) {
    return { ok: false, reason: "нет обязательных параметров" };
  }
  const expected = robokassaHash(
    `${outSum}:${invIdRaw}:${password}${shpSuffix(params)}`
  );
  if (!sameSignature(expected, received)) {
    return { ok: false, reason: "подпись не совпала" };
  }
  const invId = Number(invIdRaw);
  const sum = Number(outSum);
  if (!Number.isInteger(invId) || invId <= 0 || !Number.isFinite(sum)) {
    return { ok: false, reason: "некорректные InvId/OutSum" };
  }
  return { ok: true, invId, outSum: sum };
}

// Уведомление об оплате на Result URL (сервер-сервер, Пароль#2).
export function checkResultNotification(
  params: Record<string, string>
): NotificationCheck {
  return checkNotification(params, robokassaPassword(2));
}

// Возврат покупателя на Success URL (браузер, Пароль#1). Подпись здесь —
// единственная причина верить, что оплата действительно прошла: в остальном
// это обычный переход по ссылке, который может подделать кто угодно.
export function checkSuccessNotification(
  params: Record<string, string>
): NotificationCheck {
  return checkNotification(params, robokassaPassword(1));
}

// Состояния операции (XML-интерфейс OpStateExt).
export const ROBOKASSA_STATE = {
  initiated: 5, // счёт выставлен, деньги не получены
  cancelled: 10, // операция отменена, деньги не получены
  received: 50, // деньги от покупателя получены, идёт зачисление магазину
  refunded: 60, // деньги возвращены покупателю
  suspended: 80, // исполнение операции приостановлено
  completed: 100, // операция выполнена успешно
} as const;

export type RobokassaState = {
  // Код результата запроса: 0 — успешно, иначе операция не найдена/ошибка.
  resultCode: number;
  resultDescription: string;
  // Код состояния операции (см. ROBOKASSA_STATE) или null, если операции нет.
  stateCode: number | null;
  outSum: number | null;
  // Ключ операции в Robokassa — по нему операцию находят в ЛК и по нему же
  // делают возврат.
  opKey: string | null;
};

function xmlValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

// Разбор ответа OperationStateResponse. Полноценный XML-парсер ради трёх полей
// тянуть незачем: структура ответа фиксирована и описана в документации.
export function parseOpState(xml: string): RobokassaState {
  const resultBlock = xmlValue(xml, "Result") ?? "";
  const stateBlock = xmlValue(xml, "State") ?? "";
  const infoBlock = xmlValue(xml, "Info") ?? "";
  const num = (v: string | null) => {
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    resultCode: num(xmlValue(resultBlock, "Code")) ?? -1,
    resultDescription: xmlValue(resultBlock, "Description") ?? "",
    stateCode: num(xmlValue(stateBlock, "Code")),
    outSum: num(xmlValue(infoBlock, "OutSum")),
    opKey: xmlValue(infoBlock, "OpKey"),
  };
}

// Запрос состояния операции у Robokassa (server-to-server).
// Подпись: MerchantLogin:InvoiceID:Пароль#2.
export async function robokassaOpState(invId: number): Promise<RobokassaState> {
  const login = robokassaLogin();
  const invoiceId = String(Math.round(invId));
  const signature = robokassaHash(
    `${login}:${invoiceId}:${robokassaPassword(2)}`
  );
  const url = `${OP_STATE_URL}?${new URLSearchParams({
    MerchantLogin: login,
    InvoiceID: invoiceId,
    Signature: signature,
  })}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
    const xml = await res.text();
    const state = parseOpState(xml);
    // Точная причина отказа видна только в логах сервера (pm2 logs seeds):
    // покупателю и админке уходит нейтральное сообщение.
    if (state.resultCode !== 0 && state.resultCode !== 3) {
      console.error(
        `[robokassa] OpStateExt счёт ${invoiceId}: код ${state.resultCode} — ${
          state.resultDescription || "без описания"
        }`
      );
    }
    return state;
  } catch (e) {
    console.error(
      `[robokassa] OpStateExt счёт ${invoiceId}: запрос не прошёл — ${
        (e as { cause?: { code?: string } })?.cause?.code ||
        (e as Error).message
      }`
    );
    throw e;
  }
}

// Оплачен ли счёт по данным Robokassa: деньги получены (50) или операция
// завершена (100). 60 — деньги уже возвращены покупателю.
export function isPaidState(state: RobokassaState): boolean {
  return (
    state.resultCode === 0 &&
    (state.stateCode === ROBOKASSA_STATE.received ||
      state.stateCode === ROBOKASSA_STATE.completed)
  );
}

// ===== Возвраты (Refund API, Пароль#3) =====
//
// Возврат делается по КЛЮЧУ ОПЕРАЦИИ (OpKey), который отдаёт OpStateExt, а не
// по номеру счёта. Запрос — JWT: заголовок и полезная нагрузка в base64url,
// подпись HMAC на Пароле#3 (у Robokassa нестандартные имена алгоритмов:
// SHA256, а не HS256). Само тело POST — этот же токен строкой в JSON.
//
// Возврат асинхронный: Create возвращает requestId, а состояние узнаётся
// отдельным запросом GetState (finished | processing | canceled).
const REFUND_API = "https://services.robokassa.ru/RefundService/Refund";

export function isRefundApiConfigured(): boolean {
  return Boolean(robokassaLogin() && robokassaPassword(3));
}

function base64url(data: Buffer | string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// JWT в понимании Robokassa: alg — MD5/SHA256/SHA512, а не HS256/HS512.
export type RobokassaJwtAlg = "MD5" | "SHA256" | "SHA512";

const HMAC_BY_ALG: Record<RobokassaJwtAlg, string> = {
  MD5: "md5",
  SHA256: "sha256",
  SHA512: "sha512",
};

export function robokassaJwt(
  payload: Record<string, unknown>,
  secret: string,
  alg: RobokassaJwtAlg = "SHA256"
): string {
  const header = base64url(JSON.stringify({ typ: "JWT", alg }));
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64url(
    crypto
      .createHmac(HMAC_BY_ALG[alg] ?? "sha256", secret)
      .update(`${header}.${body}`, "utf8")
      .digest()
  );
  return `${header}.${body}.${signature}`;
}

// Чем именно подписывать запрос возврата, документация внятно не говорит, а
// сервис отвечает только «signature verification has been failed». У соседнего
// JWT-интерфейса Robokassa (выставление счетов) секрет составной —
// «логин:пароль», поэтому первым идёт он же с Паролем#3, а дальше остальные
// разумные сочетания. Порядок важен: перебор прекращается на первом ответе,
// который НЕ жалуется на подпись.
export function refundJwtVariants(): {
  label: string;
  secret: string;
  alg: RobokassaJwtAlg;
}[] {
  const login = robokassaLogin();
  const pass = robokassaPassword(3);
  return [
    { label: "логин:Пароль#3, SHA256", secret: `${login}:${pass}`, alg: "SHA256" },
    { label: "Пароль#3, SHA256", secret: pass, alg: "SHA256" },
    { label: "логин:Пароль#3, MD5", secret: `${login}:${pass}`, alg: "MD5" },
    { label: "Пароль#3, MD5", secret: pass, alg: "MD5" },
  ];
}

// Ответ вида «не сошлась подпись» — единственный повод пробовать следующее
// сочетание: остальные отказы (нет такой операции, сумма больше остатка)
// повторять бессмысленно.
function isSignatureFailure(message: string | null | undefined): boolean {
  return /signature|подпис/i.test(message ?? "");
}

export type RefundCreateResult = {
  ok: boolean;
  requestId: string | null;
  message: string | null;
};

// Запрос возврата: sum не задан — возвращается вся операция целиком.
//
// Пока Robokassa не приняла подпись, пробуем следующее сочетание секрета и
// алгоритма (см. refundJwtVariants). Двойного возврата это не создаёт: к
// следующей попытке переходим ТОЛЬКО когда сервис ответил «не сошлась подпись»,
// то есть запрос не был выполнен.
export async function robokassaRefund(o: {
  opKey: string;
  sum?: number | null;
}): Promise<RefundCreateResult> {
  const payload: Record<string, unknown> = { OpKey: o.opKey };
  if (typeof o.sum === "number" && o.sum > 0) {
    payload.RefundSum = Math.round(o.sum * 100) / 100;
  }

  let last: RefundCreateResult = {
    ok: false,
    requestId: null,
    message: "Robokassa не приняла запрос возврата",
  };

  for (const variant of refundJwtVariants()) {
    const res = await fetch(`${REFUND_API}/Create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Тело — сам токен строкой JSON (именно так его ждёт Robokassa).
      body: JSON.stringify(robokassaJwt(payload, variant.secret, variant.alg)),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      requestId?: string;
    };

    if (res.ok && data.success) {
      console.log(
        `[robokassa] возврат по операции ${o.opKey}: принят (подпись — ${variant.label})`
      );
      return {
        ok: true,
        requestId: data.requestId ?? null,
        message: data.message ?? null,
      };
    }

    console.error(
      `[robokassa] возврат по операции ${o.opKey}: отказ (HTTP ${res.status}, подпись — ${
        variant.label
      }) — ${data.message ?? "без описания"}`
    );
    last = {
      ok: false,
      requestId: data.requestId ?? null,
      message: data.message ?? null,
    };
    if (!isSignatureFailure(data.message)) break;
  }

  return last;
}

export type RefundState = {
  // finished — деньги возвращены, processing — в работе, canceled — отклонён.
  label: string | null;
  amount: number | null;
  message: string | null;
};

export async function robokassaRefundState(
  requestId: string
): Promise<RefundState> {
  const res = await fetch(
    `${REFUND_API}/GetState?${new URLSearchParams({ id: requestId })}`,
    { signal: AbortSignal.timeout(20000) }
  );
  const data = (await res.json().catch(() => ({}))) as {
    label?: string;
    amount?: number | string;
    message?: string;
  };
  const amount = Number(data.amount);
  return {
    label: data.label ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    message: data.message ?? null,
  };
}

// Идёт ли по счёту работа с деньгами — такой заказ удалять нельзя.
export function isMoneyInvolvedState(state: RobokassaState): boolean {
  return (
    state.resultCode === 0 &&
    (state.stateCode === ROBOKASSA_STATE.received ||
      state.stateCode === ROBOKASSA_STATE.completed ||
      state.stateCode === ROBOKASSA_STATE.suspended ||
      state.stateCode === ROBOKASSA_STATE.refunded)
  );
}
