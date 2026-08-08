// Переход на платёжную страницу Robokassa.
//
// Отправляем именно POST-форму, а не ссылку: фискальный чек с номенклатурой не
// влезает в ограничение длины URL, а параметры платежа не попадают в историю
// браузера и в Referer. Форму собирает браузер по данным, подписанным на
// сервере (см. lib/robokassa.ts) — здесь только разметка и submit.
export function submitPaymentForm(url: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.acceptCharset = "utf-8";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export type PaymentResponse = {
  payment?: { url?: string; fields?: Record<string, string> };
  error?: string;
};
