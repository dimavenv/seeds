// Проверка Yandex SmartCaptcha (российский антибот-сервис, Yandex Cloud).
// Серверный ключ — SMARTCAPTCHA_SERVER_KEY (только сервер). Клиентский ключ —
// NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY (в браузер). Пока ключи не заданы — капча
// ВЫКЛЮЧЕНА (isCaptchaEnabled() === false), формы работают как раньше.

export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.SMARTCAPTCHA_SERVER_KEY);
}

// Возвращает true, если токен валиден (или капча выключена).
export async function verifyCaptcha(
  token: string | undefined | null,
  userIp?: string
): Promise<boolean> {
  const secret = process.env.SMARTCAPTCHA_SERVER_KEY;
  if (!secret) return true; // капча не подключена — пропускаем
  if (!token) return false;

  try {
    const params = new URLSearchParams({ secret, token });
    if (userIp) params.set("ip", userIp);
    const res = await fetch(
      "https://smartcaptcha.yandexcloud.net/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    // Сервис недоступен — не блокируем пользователя (fail-open).
    return true;
  }
}
