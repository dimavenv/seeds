import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE,
  cookieHeader,
  listOAuthProviders,
  oauthRedirectUrl,
  packHandshake,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

// Начало входа через внешний сервис: уводим браузер на страницу согласия
// (Яндекс ID). PKCE-верификатор и state кладём в httpOnly-cookie — на возврате
// по ним проверяется, что пришли именно с нашей попытки входа, а не по чужой
// подсунутой ссылке.
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("provider") ?? "";
  const provider = (await listOAuthProviders()).find((p) => p.name === name);
  if (!provider) {
    return NextResponse.redirect(absoluteUrl("/login?oauth=unavailable"), 303);
  }

  // PocketBase отдаёт authURL, уже оканчивающийся на «redirect_uri=» —
  // дописываем свой адрес возврата.
  const url = provider.authURL + encodeURIComponent(oauthRedirectUrl());

  const res = NextResponse.redirect(url, 303);
  // Заголовок собираем сами (см. cookieHeader): SameSite=Lax тут обязателен —
  // возврат приходит с домена Яндекса, при Strict браузер cookie не пришлёт и
  // вход сорвётся.
  res.headers.append(
    "Set-Cookie",
    cookieHeader(
      OAUTH_COOKIE,
      packHandshake({
        state: provider.state,
        codeVerifier: provider.codeVerifier,
        provider: provider.name,
      }),
      {
        maxAge: OAUTH_COOKIE_MAX_AGE,
        secure: (request.headers.get("x-forwarded-proto") || "https") === "https",
      }
    )
  );
  return res;
}
