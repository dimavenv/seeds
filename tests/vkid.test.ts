import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  describeTokenError,
  emailFromIdToken,
  generatePkce,
  vkidAuthUrl,
} from "@/lib/vkid";

// Сборка JWT без подписи: нам важен только разбор payload.
function jwt(payload: Record<string, unknown>): string {
  const part = (o: unknown) =>
    Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${part({ alg: "RS256" })}.${part(payload)}.podpis`;
}

describe("почта из id_token", () => {
  it("достаётся из claim email", () => {
    expect(emailFromIdToken(jwt({ sub: "1", email: "user@vk.com" }))).toBe(
      "user@vk.com"
    );
  });

  it("нет почты — null, а не пустая строка", () => {
    // Аккаунт ВК по номеру телефона: claim'а email просто не будет.
    expect(emailFromIdToken(jwt({ sub: "1" }))).toBeNull();
    expect(emailFromIdToken(jwt({ sub: "1", email: 42 }))).toBeNull();
    expect(emailFromIdToken(jwt({ sub: "1", email: "не-почта" }))).toBeNull();
  });

  it("мусор вместо токена не роняет разбор", () => {
    expect(emailFromIdToken("")).toBeNull();
    expect(emailFromIdToken("a.b")).toBeNull();
    expect(emailFromIdToken("a.b.c")).toBeNull();
  });
});

describe("PKCE", () => {
  it("вызов — это SHA-256 верификатора в base64url", () => {
    const { verifier, challenge } = generatePkce();
    const expected = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(challenge).toBe(expected);
    // base64url: без +, / и = — иначе адрес авторизации придётся кодировать
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("каждый раз новый", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generatePkce().verifier);
    expect(seen.size).toBe(50);
  });
});

describe("адрес авторизации VK ID", () => {
  it("содержит всё, что ждёт id.vk.ru", () => {
    process.env.VK_CLIENT_ID = "12345";
    const url = new URL(
      vkidAuthUrl({
        redirectUrl: "https://tomatsemena.ru/api/auth/oauth/callback",
        state: "st-1",
        codeChallenge: "ch-1",
      })
    );
    expect(url.origin + url.pathname).toBe("https://id.vk.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("12345");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://tomatsemena.ru/api/auth/oauth/callback"
    );
    expect(url.searchParams.get("scope")).toBe("email");
    expect(url.searchParams.get("state")).toBe("st-1");
    expect(url.searchParams.get("code_challenge")).toBe("ch-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("разбор отказа от VK ID", () => {
  it("формат OAuth: error + error_description", () => {
    expect(
      describeTokenError(
        { error: "invalid_grant", error_description: "code expired" },
        200
      )
    ).toBe("invalid_grant: code expired (HTTP 200)");
  });

  it("формат VK API: вложенный объект error", () => {
    expect(
      describeTokenError(
        { error: { error_code: 5, error_msg: "User authorization failed" } },
        200
      )
    ).toBe("код 5: User authorization failed (HTTP 200)");
  });

  it("ничего узнаваемого — показываем поля ответа", () => {
    expect(describeTokenError({ foo: 1, bar: 2 }, 400)).toBe(
      "ответ без access_token (HTTP 400), поля: foo, bar"
    );
    expect(describeTokenError({}, 500)).toBe("пустой ответ (HTTP 500)");
  });
});
