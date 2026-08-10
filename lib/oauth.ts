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

// Провайдеры, которые сайт готов показывать. Список закрытый: включённый в
// PocketBase «на посмотреть» провайдер не должен молча появиться на странице
// входа.
const KNOWN: Record<string, { title: string }> = {
  yandex: { title: "Яндекс ID" },
};

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
        codeVerifier: p.codeVerifier,
      }));
  } catch {
    // PocketBase недоступен или OAuth не настроен — просто не предлагаем вход
    // через провайдера, обычный вход по паролю не затронут.
    return [];
  }
}

export type OAuthHandshake = { state: string; codeVerifier: string; provider: string };

export function packHandshake(h: OAuthHandshake): string {
  return JSON.stringify(h);
}

export function unpackHandshake(raw: string | undefined): OAuthHandshake | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<OAuthHandshake>;
    if (
      typeof p.state === "string" &&
      typeof p.codeVerifier === "string" &&
      typeof p.provider === "string"
    ) {
      return { state: p.state, codeVerifier: p.codeVerifier, provider: p.provider };
    }
    return null;
  } catch {
    return null;
  }
}
