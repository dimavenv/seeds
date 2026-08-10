import { describe, expect, it } from "vitest";
import { cookieHeader, packHandshake, unpackHandshake } from "@/lib/oauth";

const handshake = {
  state: "abc123",
  codeVerifier: "verifier-with-dashes_and~tilde",
  provider: "yandex",
};

describe("рукопожатие OAuth в cookie", () => {
  it("переживает дорогу туда и обратно", () => {
    expect(unpackHandshake(packHandshake(handshake))).toEqual(handshake);
  });

  it("в значении нет символов, недопустимых в cookie", () => {
    // Кавычки, скобки, запятые и пробелы ломают cookie (RFC 6265) — раньше
    // сюда клался сырой JSON, и значение по дороге перекодировали.
    expect(packHandshake(handshake)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("читается и если значение по дороге закодировали", () => {
    const packed = packHandshake(handshake);
    expect(unpackHandshake(encodeURIComponent(packed))).toEqual(handshake);
  });

  it("переживает провайдера без PKCE (ВКонтакте)", () => {
    // У ВК верификатора нет, и это не повод считать рукопожатие сломанным.
    const packed = packHandshake({ ...handshake, provider: "vk", codeVerifier: "" });
    expect(unpackHandshake(packed)).toEqual({
      state: handshake.state,
      codeVerifier: "",
      provider: "vk",
    });
    // и если поля нет вовсе
    const noVerifier = Buffer.from(
      JSON.stringify({ state: "s", provider: "vk" })
    ).toString("base64url");
    expect(unpackHandshake(noVerifier)).toEqual({
      state: "s",
      codeVerifier: "",
      provider: "vk",
    });
  });

  it("мусор не притворяется рукопожатием", () => {
    expect(unpackHandshake(undefined)).toBeNull();
    expect(unpackHandshake("")).toBeNull();
    expect(unpackHandshake("не-base64!")).toBeNull();
    // валидный base64 без нужных полей
    expect(unpackHandshake(Buffer.from('{"a":1}').toString("base64url"))).toBeNull();
  });
});

describe("заголовок Set-Cookie", () => {
  it("значение уходит как есть, без повторного кодирования", () => {
    const packed = packHandshake(handshake);
    const header = cookieHeader("pb_oauth", packed, { maxAge: 600, secure: true });
    expect(header).toContain(`pb_oauth=${packed}`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");
    expect(header).toContain("Max-Age=600");
  });

  it("без HTTPS не помечает cookie как Secure — иначе её не поставить", () => {
    const header = cookieHeader("pb_oauth", "x", { maxAge: 0, secure: false });
    expect(header).not.toContain("Secure");
    expect(header).toContain("Max-Age=0");
  });
});
