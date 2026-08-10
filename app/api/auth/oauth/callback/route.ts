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

  // Покупатель нажал «Отмена» на странице согласия.
  if (params.get("error")) return clear(fail("denied"));

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
