// Клиент интернет-эквайринга Альфа-Банка (REST-шлюз RBS).
// Документация: alfabank.ru/sme/payservice/internet-acquiring/docs/
//
// ВАЖНО: все суммы — в КОПЕЙКАХ (рубли × 100). Логин/пароль/шлюз — только на
// сервере (никогда не в браузер). Пока переменные не заданы — оплата выключена
// (isAlfaConfigured() === false), и сайт работает без онлайн-оплаты.
//
// Переменные окружения (.env.production):
//   ALFA_GATEWAY  — боевой https://pay.alfabank.ru/payment/rest (логин без
//                   префикса) или https://payment.alfabank.ru/payment/rest
//                   (r-логин); тест https://alfa.rbsuat.com/payment/rest
//   ALFA_USERNAME — API-логин (обычно с суффиксом -api)
//   ALFA_PASSWORD — пароль API-логина
//   ALFA_CALLBACK_TOKEN — общий токен для проверки подписи callback (симметричный)

const GATEWAY = (process.env.ALFA_GATEWAY || "").replace(/\/+$/, "");

export function isAlfaConfigured(): boolean {
  return Boolean(
    GATEWAY && process.env.ALFA_USERNAME && process.env.ALFA_PASSWORD
  );
}

// TLS-коды, которые почти всегда означают, что в системе нет корневых
// сертификатов Минцифры: шлюзы Альфы работают на «Russian Trusted CA»
// (см. SETUP-PAYMENTS-RU.md, раздел про сертификаты Минцифры).
const TLS_CERT_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_UNTRUSTED",
]);

async function alfa(
  method: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    userName: process.env.ALFA_USERNAME || "",
    password: process.env.ALFA_PASSWORD || "",
    ...params,
  });
  try {
    const res = await fetch(`${GATEWAY}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as Record<string, unknown>;
    // Покупателю уходит нейтральное «оплата недоступна» — точная причина
    // отказа банка видна только здесь, поэтому пишем её в лог (pm2 logs seeds).
    if (data.errorCode && String(data.errorCode) !== "0") {
      // Контекст (без самого пароля) — чтобы сверить, с чем реально ходил
      // процесс сайта, если файл .env.production выглядит правильным.
      const user = process.env.ALFA_USERNAME || "";
      const passLen = (process.env.ALFA_PASSWORD || "").length;
      console.error(
        `[alfa] ${method}: банк вернул ошибку ${data.errorCode} — ${
          data.errorMessage ?? "без описания"
        } (шлюз ${GATEWAY}, логин ${user}, пароль ${passLen} симв.)`
      );
    }
    return data;
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const code = cause?.code ?? "";
    const hint = TLS_CERT_CODES.has(code)
      ? " Похоже, на сервере нет сертификатов Минцифры — запусти `node scripts/check-alfa.mjs` и см. SETUP-PAYMENTS-RU.md."
      : "";
    console.error(
      `[alfa] ${method}: запрос к шлюзу не прошёл — ${
        code || cause?.message || (e as Error).message
      }.${hint}`
    );
    throw e;
  }
}

export type AlfaRegisterResult = {
  orderId?: string;
  formUrl?: string;
  errorCode?: string;
  errorMessage?: string;
};

// Одностадийная регистрация заказа: деньги списываются сразу при оплате.
export async function alfaRegister(
  params: Record<string, string>
): Promise<AlfaRegisterResult> {
  return (await alfa("register.do", params)) as AlfaRegisterResult;
}

export type AlfaStatusResult = {
  // 0 не оплачен, 1 холд, 2 оплачен, 3 отменён, 4 возврат, 5 ACS, 6 отклонён
  orderStatus?: number;
  amount?: number;
  errorCode?: string;
  errorMessage?: string;
};

export async function alfaStatus(orderId: string): Promise<AlfaStatusResult> {
  return (await alfa("getOrderStatusExtended.do", {
    orderId,
  })) as AlfaStatusResult;
}

export type AlfaRefundResult = { errorCode?: string; errorMessage?: string };

// Возврат (полный или частичный). amount — в копейках.
export async function alfaRefund(
  orderId: string,
  amount: string
): Promise<AlfaRefundResult> {
  return (await alfa("refund.do", { orderId, amount })) as AlfaRefundResult;
}
