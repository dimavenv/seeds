import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyRecipients } from "@/lib/admin-mail";

afterEach(() => {
  delete process.env.ADMIN_NOTIFY_EMAIL;
  delete process.env.ADMIN_NOTIFY_EMAIL_EXTRA;
  vi.restoreAllMocks();
});

describe("notifyRecipients — получатели уведомлений продавцу", () => {
  it("пусто, пока не задана ни одна переменная", () => {
    expect(notifyRecipients()).toEqual([]);
  });

  it("складывает служебный ящик и вторую обычную почту", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "service@tomatsemena.ru";
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA = "hozyain@yandex.ru";
    expect(notifyRecipients()).toEqual([
      "service@tomatsemena.ru",
      "hozyain@yandex.ru",
    ]);
  });

  it("работает и когда задана только вторая почта", () => {
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA = "hozyain@yandex.ru";
    expect(notifyRecipients()).toEqual(["hozyain@yandex.ru"]);
  });

  it("понимает списки через запятую и точку с запятой, чистит пробелы", () => {
    process.env.ADMIN_NOTIFY_EMAIL = " a@x.ru , b@y.ru ";
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA = "c@z.ru;d@w.ru";
    expect(notifyRecipients()).toEqual(["a@x.ru", "b@y.ru", "c@z.ru", "d@w.ru"]);
  });

  it("не дублирует один и тот же адрес (в том числе в другом регистре)", () => {
    process.env.ADMIN_NOTIFY_EMAIL = "service@tomatsemena.ru";
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA = "SERVICE@tomatsemena.ru";
    expect(notifyRecipients()).toEqual(["service@tomatsemena.ru"]);
  });

  it("выбрасывает мусор и попытку подставить лишний заголовок в письмо", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.ADMIN_NOTIFY_EMAIL = "не почта, ok@x.ru";
    process.env.ADMIN_NOTIFY_EMAIL_EXTRA =
      "evil@x.ru\nBcc: kto-to@drugoy.ru, no-domain@localhost";
    expect(notifyRecipients()).toEqual(["ok@x.ru"]);
  });
});
