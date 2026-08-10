import "server-only";
import { createPublicPb } from "@/lib/pb/server";
import { absoluteUrl } from "@/lib/seo";

// Вход через Яндекс ID (OAuth2 у PocketBase).
//
// Как устроено. PocketBase умеет OAuth2 сам: провайдер («yandex») включается в
// его настройках парой ключей приложения, а SDK даёт готовый адрес авторизации
// и PKCE-верификатор. Сайт при этом остаётся посредником: браузер уходит на
// Яндекс, возвращается на наш /api/auth/oauth/callback, и уже СЕРВЕР меняет код
// на сессию и кладёт её в httpOnly-cookie — ровно как при обычном входе
// (см. /api/auth/login). Токен в JS не попадает.
//
// Ключи приложения (client id/secret) живут ТОЛЬКО в PocketBase, не в Next:
// сайту они не нужны, а лишняя копия секрета — лишний риск. Как их прописать —
// см. SETUP-AUTH-RU.md.

// Cookie с PKCE-верификатором и state между уходом на Яндекс и возвратом.
// httpOnly, живёт 10 минут; sameSite обязан быть Lax — иначе браузер не
// пришлёт её при возврате с чужого домена.
export const OAUTH_COOKIE = "pb_oauth";
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

// Готовая строка заголовка Set-Cookie.
//
// Собираем её руками нарочно. NextResponse.cookies.set() при записи ПЕРЕСОБИРАЕТ
// все Set-Cookie ответа и заново прогоняет их значения через encodeURIComponent
// — а сессионная cookie PocketBase уже закодирована своим exportToCookie.
// Второе кодирование ломает её так, что сервер потом не может её прочитать:
// вход внешне «проходил», но пользователь возвращался гостем без единой ошибки.
// Поэтому в ответах с сессией пользуемся только сырыми заголовками.
export function cookieHeader(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean }
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    opts.secure ? "Secure" : "",
    `Max-Age=${opts.maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

// Провайдеры, которые сайт готов показывать. Список закрытый: включённый в
// PocketBase «на посмотреть» провайдер не должен молча появиться на странице
// входа.
const KNOWN: Record<string, { title: string }> = {
  yandex: { title: "Яндекс ID" },
  vk: { title: "VK ID" },
};

export function providerTitle(name: string): string {
  return KNOWN[name]?.title ?? "внешний сервис";
}

export type OAuthProvider = {
  name: string;
  title: string;
  // Адрес авторизации без redirect_uri (его дописывает start-роут).
  authURL: string;
  state: string;
  codeVerifier: string;
};

// Куда Яндекс возвращает покупателя. Этот же адрес прописывается в настройках
// приложения на oauth.yandex.ru — он обязан совпадать до символа.
export function oauthRedirectUrl(): string {
  return absoluteUrl("/api/auth/oauth/callback");
}

// Какие провайдеры реально включены в PocketBase. Пустой список — кнопок на
// странице входа не будет, всё работает как раньше.
export async function listOAuthProviders(): Promise<OAuthProvider[]> {
  try {
    const pb = createPublicPb();
    const methods = await pb.collection("users").listAuthMethods();
    const providers = methods.oauth2?.enabled ? methods.oauth2.providers : [];
    return providers
      .filter((p) => p.name in KNOWN)
      .map((p) => ({
        name: p.name,
        title: KNOWN[p.name].title,
        authURL: p.authURL,
        state: p.state,
        // У провайдеров без PKCE (ВКонтакте) верификатора нет — и это нормально:
        // на обмен кода он тогда просто не влияет.
        codeVerifier: p.codeVerifier ?? "",
      }));
  } catch {
    // PocketBase недоступен или OAuth не настроен — просто не предлагаем вход
    // через провайдера, обычный вход по паролю не затронут.
    return [];
  }
}

export type OAuthHandshake = { state: string; codeVerifier: string; provider: string };

// Рукопожатие едет в cookie, поэтому пакуем его в base64url, а не кладём JSON
// как есть: в значении cookie кавычкам и фигурным скобкам не место (RFC 6265),
// и по дороге их кто-нибудь обязательно перекодирует — а base64url переживает
// и percent-encoding, и его отсутствие одинаково.
export function packHandshake(h: OAuthHandshake): string {
  return Buffer.from(JSON.stringify(h), "utf8").toString("base64url");
}

export function unpackHandshake(raw: string | undefined): OAuthHandshake | null {
  if (!raw) return null;
  try {
    // decodeURIComponent — на случай, если значение всё-таки закодировали:
    // для чистого base64url это тождественное преобразование.
    const json = Buffer.from(decodeURIComponent(raw), "base64url").toString("utf8");
    const p = JSON.parse(json) as Partial<OAuthHandshake>;
    if (typeof p.state === "string" && typeof p.provider === "string") {
      return {
        state: p.state,
        // Пустой верификатор — законный случай (провайдер без PKCE).
        codeVerifier: typeof p.codeVerifier === "string" ? p.codeVerifier : "",
        provider: p.provider,
      };
    }
    return null;
  } catch {
    return null;
  }
}
