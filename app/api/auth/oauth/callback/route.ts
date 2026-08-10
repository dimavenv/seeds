import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createPublicPb } from "@/lib/pb/server";
import { PB_COOKIE } from "@/lib/pb/shared";
import { absoluteUrl } from "@/lib/seo";
import {
  OAUTH_COOKIE,
  cookieHeader,
  oauthRedirectUrl,
  unpackHandshake,
} from "@/lib/oauth";
import { VKID_PROVIDER, exchangeVkIdCode, fetchVkIdName } from "@/lib/vkid";
import { loginByVerifiedEmail, sessionCookie } from "@/lib/external-login";

export const dynamic = "force-dynamic";

// Возврат с Яндекс ID. Меняем одноразовый код на сессию PocketBase и кладём её
// в httpOnly-cookie — дальше сайт не отличает такой вход от входа по паролю.
//
// Аккаунт при первом входе PocketBase создаёт сам (почта и имя приходят от
// провайдера). Пароля у такого аккаунта нет — если он понадобится, покупатель
// задаст его через «Забыли пароль?»: код туда придёт на ту же почту.

// provider — чтобы страница входа назвала сервис, а не «внешний сервис вообще».
function fail(reason: string, provider?: string): NextResponse {
  const qs = new URLSearchParams({ oauth: reason });
  if (provider) qs.set("p", provider);
  return NextResponse.redirect(absoluteUrl(`/login?${qs.toString()}`), 303);
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

  const secure = (request.headers.get("x-forwarded-proto") || "https") === "https";

  // Рукопожатие одноразовое — гасим cookie в любом исходе. Только сырым
  // заголовком: NextResponse.cookies.set() пересобрал бы ВСЕ Set-Cookie ответа
  // и заново закодировал бы сессионную cookie PocketBase, которая уже
  // закодирована (см. cookieHeader в lib/oauth.ts).
  const clear = (res: NextResponse) => {
    res.headers.append("Set-Cookie", cookieHeader(OAUTH_COOKIE, "", { maxAge: 0, secure }));
    return res;
  };

  // Имя сервиса известно из cookie рукопожатия — им подписываем и лог, и
  // сообщение покупателю.
  const pending = unpackHandshake(cookies().get(OAUTH_COOKIE)?.value);
  const who = pending?.provider;

  // Провайдер вернул ошибку вместо кода. Разбираем: «отменил вход» — это одно,
  // а неверно заведённое приложение — совсем другое, и покупателю про него
  // сказать нечего, зато в логе причина должна быть видна сразу.
  const oauthError = params.get("error");
  if (oauthError) {
    console.error(
      `[oauth] ${who ?? "провайдер"} вернул ошибку «${oauthError}»${
        params.get("error_description")
          ? `: ${params.get("error_description")}`
          : ""
      }`
    );
    if (oauthError === "access_denied") return clear(fail("denied", who));
    if (oauthError === "invalid_scope") {
      // Приложению не выданы доступы, которые запрашивает PocketBase — их
      // список для каждого сервиса есть в SETUP-AUTH-RU.md.
      console.error(
        "[oauth] у приложения нет запрошенных доступов: у Яндекса нужны login:email, login:info и login:avatar, у ВКонтакте — email. См. SETUP-AUTH-RU.md"
      );
      return clear(fail("misconfigured", who));
    }
    return clear(fail("failed", who));
  }

  // Дальше причины расписаны по отдельности: в прошлый раз одна общая строка в
  // логе не давала понять, на каком именно шаге всё встало.
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  if (!code || !state) {
    console.error("[oauth] возврат без code или state в адресе");
    return clear(fail("failed", who));
  }

  const handshake = pending;
  if (!handshake) {
    console.error(
      "[oauth] потеряна cookie рукопожатия: вход открывали дольше 10 минут либо сайт открыт не по тому домену, что в SITE_URL"
    );
    return clear(fail("failed"));
  }
  if (!sameState(state, handshake.state)) {
    console.error("[oauth] state из адреса не совпал с сохранённым");
    return clear(fail("failed", who));
  }

  // ===== VK ID: свой обмен кода (PocketBase его протокол не поддерживает) =====
  if (handshake.provider === VKID_PROVIDER) {
    const exchange = await exchangeVkIdCode({
      code,
      codeVerifier: handshake.codeVerifier,
      redirectUrl: oauthRedirectUrl(),
      // ВКонтакте передаёт device_id рядом с code — он нужен на обмене.
      deviceId: params.get("device_id"),
      state: handshake.state,
    });
    if (!exchange.ok) {
      // device_id упоминаем нарочно: если ВКонтакте его не прислал, обмен
      // разваливается именно из-за этого, а по одному тексту ошибки не видно.
      console.error(
        `[oauth] vkid: обмен кода не удался: ${exchange.error}` +
          ` (device_id ${params.get("device_id") ? "получен" : "НЕ получен"},` +
          ` redirect_uri ${oauthRedirectUrl()})`
      );
      return clear(fail("failed", VKID_PROVIDER));
    }
    const { accessToken, email } = exchange.identity;
    if (!email) {
      console.error(
        "[oauth] vkid: ВКонтакте не передал почту (аккаунт по номеру телефона) — вход невозможен"
      );
      return clear(fail("noemail", VKID_PROVIDER));
    }

    const { firstName, lastName } = await fetchVkIdName(accessToken);
    const login = await loginByVerifiedEmail({ email, firstName, lastName });
    if (!login.ok) return clear(fail(login.error, VKID_PROVIDER));

    console.log(
      `[oauth] vkid: вход выполнен (${email}${login.created ? ", аккаунт создан" : ""})`
    );
    const res = NextResponse.redirect(absoluteUrl("/account"), 303);
    res.headers.append(
      "Set-Cookie",
      sessionCookie(login.token, login.record, secure)
    );
    return clear(res);
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
    // Частый и понятный случай у ВКонтакте: аккаунт заведён по номеру телефона,
    // почты у него нет — а без почты покупателю некуда слать чек и письма о
    // заказе, поэтому запись в базе без неё не создать. Говорим об этом прямо,
    // а не «попробуйте ещё раз»: пробовать бессмысленно.
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (data && "email" in data) {
      console.error(
        `[oauth] ${handshake.provider} не передал почту — вход невозможен, покупателю предложена регистрация по почте`
      );
      return clear(fail("noemail", handshake.provider));
    }
    return clear(fail("failed", handshake.provider));
  }

  console.log(
    `[oauth] ${handshake.provider}: вход выполнен (${pb.authStore.record?.email ?? "без почты"})`
  );

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
