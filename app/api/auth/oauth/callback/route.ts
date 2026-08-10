import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createPublicPb } from "@/lib/pb/server";
import { PB_COOKIE } from "@/lib/pb/shared";
import { absoluteUrl } from "@/lib/seo";
import { OAUTH_COOKIE, oauthRedirectUrl, unpackHandshake } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// Возврат с Яндекс ID. Меняем одноразовый код на сессию PocketBase и кладём её
// в httpOnly-cookie — дальше сайт не отличает такой вход от входа по паролю.
//
// Аккаунт при первом входе PocketBase создаёт сам (почта и имя приходят от
// провайдера). Пароля у такого аккаунта нет — если он понадобится, покупатель
// задаст его через «Забыли пароль?»: код туда придёт на ту же почту.

function fail(reason: string): NextResponse {
  return NextResponse.redirect(absoluteUrl(`/login?oauth=${reason}`), 303);
}

// Сравнение state без утечки по времени.
function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const clear = (res: NextResponse) => {
    // Рукопожатие одноразовое — гасим cookie в любом исходе.
    res.cookies.set(OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // Яндекс вернул ошибку вместо кода. Разбираем: «отменил вход» — это одно, а
  // неверно заведённое приложение — совсем другое, и покупателю про него
  // сказать нечего, зато в логе причина должна быть видна сразу.
  const oauthError = params.get("error");
  if (oauthError) {
    console.error(
      `[oauth] провайдер вернул ошибку «${oauthError}»${
        params.get("error_description")
          ? `: ${params.get("error_description")}`
          : ""
      }`
    );
    if (oauthError === "access_denied") return clear(fail("denied"));
    if (oauthError === "invalid_scope") {
      // Приложению на oauth.yandex.ru не выданы нужные доступы — см.
      // SETUP-AUTH-RU.md, там перечислены все три (login:email, login:info,
      // login:avatar).
      console.error(
        "[oauth] у приложения Яндекса нет запрошенных доступов — включите login:email, login:info и login:avatar в его настройках"
      );
      return clear(fail("misconfigured"));
    }
    return clear(fail("failed"));
  }

  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const handshake = unpackHandshake(cookies().get(OAUTH_COOKIE)?.value);

  if (!code || !state || !handshake || !sameState(state, handshake.state)) {
    console.error("[oauth] возврат без кода или с чужим state");
    return clear(fail("failed"));
  }

  const pb = createPublicPb();
  try {
    await pb
      .collection("users")
      .authWithOAuth2Code(
        handshake.provider,
        code,
        handshake.codeVerifier,
        oauthRedirectUrl()
      );
  } catch (e) {
    console.error(`[oauth] ${handshake.provider}: обмен кода не удался:`, e);
    return clear(fail("failed"));
  }

  const secure = (request.headers.get("x-forwarded-proto") || "https") === "https";
  const res = NextResponse.redirect(absoluteUrl("/account"), 303);
  res.headers.append(
    "Set-Cookie",
    pb.authStore.exportToCookie(
      { httpOnly: true, secure, sameSite: "Lax", path: "/" },
      PB_COOKIE
    )
  );
  return clear(res);
}
