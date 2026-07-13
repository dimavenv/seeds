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

async function alfa(
  method: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    userName: process.env.ALFA_USERNAME || "",
    password: process.env.ALFA_PASSWORD || "",
    ...params,
  });
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  return (await res.json()) as Record<string, unknown>;
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
