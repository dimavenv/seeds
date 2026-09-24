import { describe, expect, it } from "vitest";
import { plainTextFromHtml } from "@/lib/email";

describe("текстовая версия транзакционных писем", () => {
  it("сохраняет адрес одноразовой ссылки", () => {
    const html = '<p><a href="https://site.ru/password-reset?token=abc&amp;x=1">Установить пароль</a></p>';
    expect(plainTextFromHtml(html)).toBe(
      "Установить пароль (https://site.ru/password-reset?token=abc&x=1)"
    );
  });

  it("убирает стили и разметку, декодирует символы", () => {
    expect(plainTextFromHtml('<style>p{color:red}</style><p>Спасибо&nbsp;за <b>заказ</b> &amp; доверие</p>'))
      .toBe("Спасибо за заказ & доверие");
  });
});
