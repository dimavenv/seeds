import "server-only";
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/seo";

// Защита от межсайтовых запросов (CSRF) для обычных route handlers.
//
// Зачем. Сессия лежит в cookie с SameSite=Lax — она НЕ уходит при фоновом
// запросе с чужого сайта, но уходит при переходе и при отправке формы методом
// POST с верхнеуровневой навигацией. Форма с чужой страницы не может выставить
// Content-Type: application/json, зато `enctype="text/plain"` позволяет
// сложить тело так, что оно разберётся как корректный JSON, а `request.json()`
// заголовок не проверяет. То есть без этой проверки чужая страница может
// заставить браузер покупателя (или администратора) выполнить действие от его
// имени.
//
// Server Actions в App Router такую проверку делают сами — она нужна именно
// маршрутам в app/api/*.
//
// Что проверяем. Заголовок Origin браузер ставит на КАЖДЫЙ POST (в том числе
// на свой же сайт) и подделать его со страницы нельзя. Sec-Fetch-Site
// принимаем как равноценный признак: его шлют все современные браузеры.
//
// Чего проверка НЕ касается: уведомлений Robokassa (они приходят
// сервер-сервер, без Origin, и защищены подписью) и роутов с секретом в
// заголовке (/api/cron/*, /api/revalidate) — там доказательством служит сам
// секрет.

function normalize(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// Адреса, с которых мы принимаем свои же формы: настроенный адрес сайта и тот,
// по которому запрос реально пришёл (сайт может открываться по IP до домена —
// см. SETUP-VPS-RU.md). Host для CSRF безопасен: подделать Origin в браузере
// нельзя, а подмена Host злоумышленнику ничего не даёт.
function allowedOrigins(request: Request): string[] {
  const out = [normalize(siteUrl())];
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    out.push(normalize(`${proto}://${host}`));
    out.push(normalize(`http://${host}`));
  }
  return out.filter(Boolean);
}

export function isSameOrigin(request: Request): boolean {
  // Sec-Fetch-Site заполняет сам браузер: same-origin — запрос со своей же
  // страницы, none — набран в адресной строке.
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  if (site === "cross-site" || site === "same-site") return false;

  const origin = request.headers.get("origin");
  // Ни Origin, ни Sec-Fetch-Site: это не браузерный запрос к форме сайта.
  if (!origin) return false;
  return allowedOrigins(request).includes(normalize(origin));
}

// Готовый ответ для маршрута: null — можно работать дальше.
export function csrfGuard(request: Request): NextResponse | null {
  if (isSameOrigin(request)) return null;
  console.error(
    `[csrf] запрос с чужого источника отклонён: origin=${
      request.headers.get("origin") ?? "нет"
    } sec-fetch-site=${request.headers.get("sec-fetch-site") ?? "нет"}`
  );
  return NextResponse.json(
    { error: "Запрос отклонён: откройте страницу заново и повторите" },
    { status: 403 }
  );
}
