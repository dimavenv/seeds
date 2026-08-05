// Согласие на аналитические cookies — одно место на весь сайт.
//
// Политика конфиденциальности (раздел 7) обещает, что счётчики подключаются
// только ПОСЛЕ согласия. Поэтому отметку согласия читает и плашка
// (components/cookie-consent.tsx), и загрузчик счётчиков
// (components/analytics.tsx) — а чтобы второй узнал о нажатии «Хорошо» без
// перезагрузки страницы, плашка стреляет событием в window.

const STORAGE_KEY = "cookie_consent";

// Имя события намеренно с префиксом: в window летит много чужого.
export const COOKIE_CONSENT_EVENT = "tomatsemena:cookie-consent";

export function hasCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    // приватный режим — считаем, что согласия нет: счётчик не подключаем
    return false;
  }
}

export function setCookieConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // некуда сохранить — согласие действует до конца текущей страницы
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}
