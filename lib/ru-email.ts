// Проверка, что email на российском почтовом сервисе.
// Разрешаем: любой домен в зонах .ru / .рф / .su, а также известные российские
// почтовые провайдеры на других зонах (yandex.com, ya.ru и т.п.).

const RU_TLDS = [".ru", ".su", ".xn--p1ai" /* .рф в punycode */];

// Российские провайдеры на не-.ru зонах (или алиасы).
const RU_MAIL_DOMAINS = new Set([
  "yandex.ru", "ya.ru", "yandex.com", "yandex.by", "yandex.kz", "yandex.ua",
  "mail.ru", "list.ru", "bk.ru", "inbox.ru", "internet.ru", "mail.ua",
  "rambler.ru", "lenta.ru", "autorambler.ru", "myrambler.ru", "ro.ru", "rambler.ua",
  "vk.com", "vk.ru",
]);

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

// Нормализация .рф → punycode для сравнения хвоста.
function toAscii(domain: string): string {
  try {
    return new URL("http://" + domain).hostname;
  } catch {
    return domain;
  }
}

export function isRussianEmail(email: string): boolean {
  const m = email.trim().toLowerCase().match(EMAIL_RE);
  if (!m) return false;
  const domain = toAscii(m[1]);
  if (RU_MAIL_DOMAINS.has(domain)) return true;
  return RU_TLDS.some((tld) => domain === tld.slice(1) || domain.endsWith(tld));
}
