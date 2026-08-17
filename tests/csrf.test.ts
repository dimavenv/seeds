import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameOrigin, csrfGuard } from "@/lib/csrf";

// Отклонённые запросы пишутся в console.error — в выводе тестов это шум.
vi.spyOn(console, "error").mockImplementation(() => {});

const SITE = "https://tomatsemena.ru";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
});

function request(headers: Record<string, string>): Request {
  return new Request("https://tomatsemena.ru/api/checkout", {
    method: "POST",
    headers,
  });
}

describe("проверка источника запроса (CSRF)", () => {
  it("пропускает запрос со своей же страницы", () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    expect(isSameOrigin(request({ origin: SITE, host: "tomatsemena.ru" }))).toBe(
      true
    );
    // Sec-Fetch-Site браузер ставит сам и подделать его со страницы нельзя.
    expect(
      isSameOrigin(request({ "sec-fetch-site": "same-origin", host: "tomatsemena.ru" }))
    ).toBe(true);
  });

  it("пропускает www-вариант того же сайта", () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    // nginx отдаёт сайт и на www, и без него; страница на www шлёт свой Origin.
    expect(
      isSameOrigin(
        request({
          origin: "https://www.tomatsemena.ru",
          host: "www.tomatsemena.ru",
        })
      )
    ).toBe(true);
  });

  it("отклоняет запрос с чужого сайта", () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    expect(
      isSameOrigin(request({ origin: "https://evil.example", host: "tomatsemena.ru" }))
    ).toBe(false);
    expect(
      isSameOrigin(
        request({ "sec-fetch-site": "cross-site", host: "tomatsemena.ru" })
      )
    ).toBe(false);
  });

  it("отклоняет запрос без признаков происхождения", () => {
    // Форма с чужой страницы не может выставить Content-Type: application/json,
    // но может отправить text/plain с телом, которое разберётся как JSON.
    // Единственная защита здесь — Origin, поэтому его отсутствие не «неважно».
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    expect(isSameOrigin(request({ host: "tomatsemena.ru" }))).toBe(false);
  });

  it("отклоняет соседний поддомен", () => {
    // Поддомен — это не наш сайт: XSS на api.tomatsemena.ru не должен получать
    // право действовать от имени покупателя на основном домене.
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    expect(
      isSameOrigin(
        request({ origin: "https://api.tomatsemena.ru", host: "tomatsemena.ru" })
      )
    ).toBe(false);
  });

  it("csrfGuard отвечает 403 и не мешает своим запросам", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE;
    expect(csrfGuard(request({ origin: SITE, host: "tomatsemena.ru" }))).toBeNull();

    const denied = csrfGuard(
      request({ origin: "https://evil.example", host: "tomatsemena.ru" })
    );
    expect(denied?.status).toBe(403);
    expect(await denied?.json()).toMatchObject({ error: expect.any(String) });
  });

  it("работает до подключения домена, по адресу с IP", () => {
    // SITE_URL ещё не настроен, сайт открыт как http://IP:3000 — свои же формы
    // должны продолжать работать.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const req = new Request("http://203.0.113.10:3000/api/checkout", {
      method: "POST",
      headers: {
        origin: "http://203.0.113.10:3000",
        host: "203.0.113.10:3000",
        "x-forwarded-proto": "http",
      },
    });
    expect(isSameOrigin(req)).toBe(true);
  });
});
