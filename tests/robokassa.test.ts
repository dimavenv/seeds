import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ROBOKASSA_STATE,
  buildReceiptItems,
  buildRobokassaPayment,
  checkResultNotification,
  checkSuccessNotification,
  formatExpirationDate,
  formatOutSum,
  isMoneyInvolvedState,
  isPaidState,
  isRefundApiConfigured,
  isRobokassaConfigured,
  parseOpState,
  paramsToObject,
  pick,
  robokassaHash,
  robokassaJwt,
  refundJwtVariants,
} from "@/lib/robokassa";

const LOGIN = "tomatsemena";
const PASS1 = "pass-one";
const PASS2 = "pass-two";

const ROBOKASSA_KEYS = [
  "ROBOKASSA_LOGIN",
  "ROBOKASSA_PASSWORD1",
  "ROBOKASSA_PASSWORD2",
  "ROBOKASSA_PASSWORD3",
  "ROBOKASSA_TEST",
  "ROBOKASSA_TEST_PASSWORD1",
  "ROBOKASSA_TEST_PASSWORD2",
  "ROBOKASSA_HASH",
  "ROBOKASSA_RECEIPT",
  "ROBOKASSA_RECEIPT_ENCODE",
  "ROBOKASSA_SNO",
  "ROBOKASSA_TAX",
  "ROBOKASSA_PAYMENT_METHOD",
  "ROBOKASSA_PAYMENT_OBJECT",
  "ROBOKASSA_INVOICE_TTL_MIN",
];

beforeEach(() => {
  for (const k of ROBOKASSA_KEYS) delete process.env[k];
  process.env.ROBOKASSA_LOGIN = LOGIN;
  process.env.ROBOKASSA_PASSWORD1 = PASS1;
  process.env.ROBOKASSA_PASSWORD2 = PASS2;
});

afterEach(() => {
  for (const k of ROBOKASSA_KEYS) delete process.env[k];
});

const md5 = (s: string) =>
  crypto.createHash("md5").update(s, "utf8").digest("hex").toUpperCase();

describe("настройка", () => {
  it("оплата включается только при логине и обоих паролях", () => {
    expect(isRobokassaConfigured()).toBe(true);
    delete process.env.ROBOKASSA_PASSWORD2;
    // Без Пароля#2 нечем проверить уведомление об оплате — оплату не включаем.
    expect(isRobokassaConfigured()).toBe(false);
  });

  it("алгоритм хеша берётся из ROBOKASSA_HASH, неизвестный — md5", () => {
    expect(robokassaHash("abc")).toBe(md5("abc"));
    process.env.ROBOKASSA_HASH = "SHA-256";
    expect(robokassaHash("abc")).toBe(
      crypto.createHash("sha256").update("abc").digest("hex").toUpperCase()
    );
    process.env.ROBOKASSA_HASH = "гост";
    expect(robokassaHash("abc")).toBe(md5("abc"));
  });
});

describe("сумма", () => {
  it("всегда два знака после точки", () => {
    expect(formatOutSum(1234)).toBe("1234.00");
    expect(formatOutSum(1234.5)).toBe("1234.50");
    expect(formatOutSum(0.1 + 0.2)).toBe("0.30");
  });
});

describe("платёжная форма", () => {
  it("подпись — MerchantLogin:OutSum:InvId:Пароль#1", () => {
    const p = buildRobokassaPayment({
      invId: 1024,
      amount: 1500,
      description: "Заказ №1024",
    });
    expect(p.url).toBe("https://auth.robokassa.ru/Merchant/Index.aspx");
    expect(p.fields.SignatureValue).toBe(md5(`${LOGIN}:1500.00:1024:${PASS1}`));
    expect(p.fields.OutSum).toBe("1500.00");
    expect(p.fields.InvId).toBe("1024");
    expect(p.fields.Culture).toBe("ru");
    expect(p.fields.IsTest).toBeUndefined();
    expect(p.fields.Receipt).toBeUndefined();
  });

  it("в тестовом режиме шлёт IsTest и подписывает тестовым паролем", () => {
    process.env.ROBOKASSA_TEST = "1";
    process.env.ROBOKASSA_TEST_PASSWORD1 = "test-one";
    const p = buildRobokassaPayment({
      invId: 7,
      amount: 100,
      description: "Заказ №7",
    });
    expect(p.fields.IsTest).toBe("1");
    expect(p.fields.SignatureValue).toBe(md5(`${LOGIN}:100.00:7:test-one`));
  });

  it("описание режется до 100 символов, e-mail подставляется", () => {
    const p = buildRobokassaPayment({
      invId: 8,
      amount: 10,
      description: "Ж".repeat(150),
      email: "buyer@example.com",
    });
    expect(p.fields.Description).toHaveLength(100);
    expect(p.fields.Email).toBe("buyer@example.com");
  });

  it("чек по умолчанию: URL-кодирован и в поле, и в подписи", () => {
    process.env.ROBOKASSA_RECEIPT = "on";
    process.env.ROBOKASSA_SNO = "usn_income";
    const p = buildRobokassaPayment({
      invId: 42,
      amount: 400,
      description: "Заказ №42",
      lines: [{ name: "Томат «Бычье сердце»", price: 100, qty: 1 }],
      deliveryCost: 300,
    });
    const receipt = p.fields.Receipt;
    expect(receipt).toBeTruthy();
    const json = decodeURIComponent(receipt);
    expect(receipt).not.toBe(json); // в поле именно кодированное значение
    // Документация: «перед добавлением в строку для подписи значение Receipt
    // нужно URL-кодировать».
    expect(p.fields.SignatureValue).toBe(
      md5(`${LOGIN}:400.00:42:${receipt}:${PASS1}`)
    );
    const parsed = JSON.parse(json);
    expect(parsed.sno).toBe("usn_income");
    expect(parsed.items).toHaveLength(2);
  });

  it("режимы кодирования чека переключаются переменной окружения", () => {
    process.env.ROBOKASSA_RECEIPT = "on";
    const build = (mode: string) => {
      process.env.ROBOKASSA_RECEIPT_ENCODE = mode;
      return buildRobokassaPayment({
        invId: 43,
        amount: 100,
        description: "Заказ №43",
        lines: [{ name: "Огурец", price: 100, qty: 1 }],
      }).fields;
    };
    const sig = (receiptInSignature: string) =>
      md5(`${LOGIN}:100.00:43:${receiptInSignature}:${PASS1}`);

    const raw = build("raw");
    expect(raw.Receipt.startsWith("{")).toBe(true);
    expect(raw.SignatureValue).toBe(sig(raw.Receipt));

    const sign = build("sign");
    expect(sign.Receipt.startsWith("{")).toBe(true);
    expect(sign.SignatureValue).toBe(sig(encodeURIComponent(sign.Receipt)));

    const field = build("field");
    expect(field.Receipt.startsWith("%")).toBe(true);
    expect(field.SignatureValue).toBe(sig(decodeURIComponent(field.Receipt)));

    // «url» — прежнее имя режима field, должно продолжать работать.
    expect(build("url").SignatureValue).toBe(field.SignatureValue);
  });

  it("срок жизни счёта передаётся в ISO 8601 со смещением", () => {
    const p = buildRobokassaPayment({
      invId: 44,
      amount: 100,
      description: "Заказ №44",
      expiresAt: new Date("2030-01-31T21:05:00.000Z"),
    });
    expect(p.fields.ExpirationDate).toBe("2030-02-01T00:05:00.000+03:00");
  });
});

describe("фискальный чек", () => {
  it("сумма позиций совпадает с суммой платежа (со скидкой и доставкой)", () => {
    const lines = [
      { name: "Томат", price: 199.99, qty: 3 },
      { name: "Перец", price: 89.5, qty: 1 },
    ];
    const items = buildReceiptItems({
      lines,
      deliveryCost: 300,
      discount: 68.95, // 10% от 689.47
    });
    const goods = 199.99 * 3 + 89.5;
    const total = Math.round((goods - 68.95 + 300) * 100) / 100;
    const sum = items.reduce((s, i) => s + Math.round(i.sum * 100), 0);
    expect(sum).toBe(Math.round(total * 100));
    expect(formatOutSum(total)).toBe(formatOutSum(sum / 100));
  });

  it("доставка — отдельная позиция-услуга, бесплатной доставки в чеке нет", () => {
    const withDelivery = buildReceiptItems({
      lines: [{ name: "Томат", price: 100, qty: 1 }],
      deliveryCost: 300,
    });
    expect(withDelivery).toHaveLength(2);
    expect(withDelivery[1]).toMatchObject({
      name: "Доставка",
      sum: 300,
      payment_object: "service",
    });

    const free = buildReceiptItems({
      lines: [{ name: "Томат", price: 100, qty: 1 }],
      deliveryCost: 0,
    });
    expect(free).toHaveLength(1);
  });

  it("скидка размазывается по товарам без потери копеек", () => {
    const items = buildReceiptItems({
      lines: [
        { name: "A", price: 33.33, qty: 1 },
        { name: "B", price: 33.33, qty: 1 },
        { name: "C", price: 33.34, qty: 1 },
      ],
      discount: 10,
    });
    const sum = items.reduce((s, i) => s + Math.round(i.sum * 100), 0);
    expect(sum).toBe(Math.round((100 - 10) * 100));
    expect(items.every((i) => i.sum > 0)).toBe(true);
  });

  it("расхождение округлений дотягивается до итога заказа", () => {
    const items = buildReceiptItems({
      lines: [{ name: "Томат", price: 100.005, qty: 1 }],
      deliveryCost: 300,
      total: 400,
    });
    const sum = items.reduce((s, i) => s + Math.round(i.sum * 100), 0);
    expect(sum).toBe(40000);
  });

  it("чек в платёжной форме сходится с OutSum до копейки", () => {
    process.env.ROBOKASSA_RECEIPT = "on";
    const p = buildRobokassaPayment({
      invId: 99,
      amount: 921.04,
      description: "Заказ №99",
      lines: [
        { name: "A", price: 199.99, qty: 3 },
        { name: "B", price: 89.5, qty: 1 },
      ],
      deliveryCost: 300,
      discount: 68.95,
    });
    const receipt = JSON.parse(decodeURIComponent(p.fields.Receipt));
    const sum = receipt.items.reduce(
      (s: number, i: { sum: number }) => s + Math.round(i.sum * 100),
      0
    );
    expect(sum).toBe(Math.round(Number(p.fields.OutSum) * 100));
  });

  it("признак расчёта — предоплата, доставка всегда услуга", () => {
    const items = buildReceiptItems({
      lines: [{ name: "Томат", price: 100, qty: 1 }],
      deliveryCost: 300,
    });
    expect(items[0]).toMatchObject({
      payment_method: "full_prepayment",
      payment_object: "commodity",
    });
    expect(items[1]).toMatchObject({
      payment_method: "full_prepayment",
      payment_object: "service",
    });
  });

  it("признаки расчёта переопределяются переменными окружения", () => {
    process.env.ROBOKASSA_PAYMENT_METHOD = "full_payment";
    process.env.ROBOKASSA_PAYMENT_OBJECT = "service";
    const [item] = buildReceiptItems({
      lines: [{ name: "Консультация", price: 100, qty: 1 }],
    });
    expect(item).toMatchObject({
      payment_method: "full_payment",
      payment_object: "service",
    });
  });

  it("ставка НДС берётся из ROBOKASSA_TAX", () => {
    process.env.ROBOKASSA_TAX = "vat20";
    const [item] = buildReceiptItems({
      lines: [{ name: "Томат", price: 100, qty: 1 }],
    });
    expect(item.tax).toBe("vat20");
  });
});

describe("проверка уведомлений", () => {
  const result = (over: Record<string, string> = {}) => {
    const base = { OutSum: "1500.00", InvId: "1024", ...over };
    return {
      ...base,
      SignatureValue: md5(`${base.OutSum}:${base.InvId}:${PASS2}`),
    };
  };

  it("Result URL: подпись считается Паролем#2", () => {
    const check = checkResultNotification(result());
    expect(check).toEqual({ ok: true, invId: 1024, outSum: 1500 });
  });

  it("Result URL: подделанная сумма не проходит", () => {
    const params = result();
    params.OutSum = "1.00";
    expect(checkResultNotification(params).ok).toBe(false);
  });

  it("Result URL: подпись Паролем#1 не принимается", () => {
    const params = {
      OutSum: "1500.00",
      InvId: "1024",
      SignatureValue: md5(`1500.00:1024:${PASS1}`),
    };
    expect(checkResultNotification(params).ok).toBe(false);
    expect(checkSuccessNotification(params).ok).toBe(true);
  });

  it("Shp_-параметры входят в подпись отсортированными по имени", () => {
    const params = {
      OutSum: "10.00",
      InvId: "5",
      Shp_b: "2",
      Shp_a: "1",
      SignatureValue: md5(`10.00:5:${PASS2}:Shp_a=1:Shp_b=2`),
    };
    expect(checkResultNotification(params).ok).toBe(true);
  });

  it("регистр имён параметров и подписи не важен", () => {
    const params = {
      outsum: "10.00",
      invid: "5",
      signaturevalue: md5(`10.00:5:${PASS2}`).toLowerCase(),
    };
    expect(checkResultNotification(params)).toEqual({
      ok: true,
      invId: 5,
      outSum: 10,
    });
  });

  it("без обязательных параметров — отказ", () => {
    expect(checkResultNotification({}).ok).toBe(false);
    expect(checkResultNotification({ OutSum: "10.00" }).ok).toBe(false);
  });
});

describe("состояние операции", () => {
  const xml = (stateCode: number) => `<?xml version="1.0" encoding="utf-8"?>
<OperationStateResponse xmlns="http://auth.robokassa.ru/Merchant/WebService/Service">
  <Result><Code>0</Code><Description>Успешно</Description></Result>
  <State><Code>${stateCode}</Code><RequestDate>2026-08-03T12:00:00</RequestDate></State>
  <Info><IncCurrLabel>BankCard</IncCurrLabel><OutSum>1500.00</OutSum><OpKey>op-777</OpKey></Info>
</OperationStateResponse>`;

  it("разбирает коды результата и состояния", () => {
    const state = parseOpState(xml(ROBOKASSA_STATE.completed));
    expect(state).toMatchObject({
      resultCode: 0,
      stateCode: 100,
      outSum: 1500,
      opKey: "op-777",
    });
    expect(isPaidState(state)).toBe(true);
    expect(isMoneyInvolvedState(state)).toBe(true);
  });

  it("счёт выставлен, но не оплачен — деньги не задействованы", () => {
    const state = parseOpState(xml(ROBOKASSA_STATE.initiated));
    expect(isPaidState(state)).toBe(false);
    expect(isMoneyInvolvedState(state)).toBe(false);
  });

  it("возврат и приостановка считаются работой с деньгами", () => {
    for (const code of [ROBOKASSA_STATE.refunded, ROBOKASSA_STATE.suspended]) {
      const state = parseOpState(xml(code));
      expect(isPaidState(state)).toBe(false);
      expect(isMoneyInvolvedState(state)).toBe(true);
    }
  });

  it("операция не найдена — деньги не задействованы", () => {
    const notFound = parseOpState(
      `<OperationStateResponse><Result><Code>3</Code><Description>Операция не найдена</Description></Result></OperationStateResponse>`
    );
    expect(notFound.resultCode).toBe(3);
    expect(notFound.stateCode).toBeNull();
    expect(isMoneyInvolvedState(notFound)).toBe(false);
  });
});

describe("возвраты (Пароль#3)", () => {
  it("без Пароля#3 API возвратов выключен", () => {
    expect(isRefundApiConfigured()).toBe(false);
    process.env.ROBOKASSA_PASSWORD3 = "pass-three";
    expect(isRefundApiConfigured()).toBe(true);
  });

  it("варианты подписи возврата: первым — составной секрет логин:Пароль#3", () => {
    process.env.ROBOKASSA_PASSWORD3 = "pass-three";
    const variants = refundJwtVariants();
    expect(variants[0]).toMatchObject({
      secret: `${LOGIN}:pass-three`,
      alg: "SHA256",
    });
    // Остальные сочетания — на случай, если у магазина принят другой вариант.
    expect(variants.map((v) => `${v.secret}|${v.alg}`)).toEqual([
      `${LOGIN}:pass-three|SHA256`,
      "pass-three|SHA256",
      `${LOGIN}:pass-three|MD5`,
      "pass-three|MD5",
    ]);
  });

  it("JWT: заголовок, полезная нагрузка и HMAC на Пароле#3", () => {
    const token = robokassaJwt({ OpKey: "op-1", RefundSum: 10.5 }, "pass-three");
    const [header, body, signature] = token.split(".");
    const un64 = (v: string) =>
      Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

    // Robokassa ждёт свои имена алгоритмов: SHA256, а не HS256.
    expect(JSON.parse(un64(header))).toEqual({ typ: "JWT", alg: "SHA256" });
    expect(JSON.parse(un64(body))).toEqual({ OpKey: "op-1", RefundSum: 10.5 });
    // Подпись — HMAC-SHA256 в base64url без «=».
    const expected = crypto
      .createHmac("sha256", "pass-three")
      .update(`${header}.${body}`, "utf8")
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(signature).toBe(expected);
    expect(token).not.toContain("=");
  });
});

describe("разбор параметров", () => {
  it("URLSearchParams и объект приводятся к одному виду", () => {
    const params = paramsToObject(new URLSearchParams("InvId=5&OutSum=10.00"));
    expect(params).toEqual({ InvId: "5", OutSum: "10.00" });
    expect(pick(params, "invid")).toBe("5");
    expect(pick(params, "missing")).toBeUndefined();
  });
});

describe("формат даты", () => {
  it("московское смещение и миллисекунды", () => {
    expect(formatExpirationDate(new Date("2026-12-31T20:59:59.000Z"))).toBe(
      "2026-12-31T23:59:59.000+03:00"
    );
  });
});
