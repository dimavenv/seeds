import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { decryptField, decryptProfile, encryptField } from "@/lib/crypto";

const KEY = crypto.randomBytes(32).toString("base64");

afterEach(() => {
  delete process.env.DATA_ENCRYPTION_KEY;
});

describe("шифрование полей заказа", () => {
  it("без ключа работает как no-op", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(encryptField("+7 900 000-00-00")).toBe("+7 900 000-00-00");
    expect(decryptField("+7 900 000-00-00")).toBe("+7 900 000-00-00");
  });

  it("с ключом: шифрует и расшифровывает обратно", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const enc = encryptField("г. Москва, ул. Ленина, д. 1");
    expect(enc).not.toBe("г. Москва, ул. Ленина, д. 1");
    expect(enc!.startsWith("enc:v1:")).toBe(true);
    expect(decryptField(enc)).toBe("г. Москва, ул. Ленина, д. 1");
  });

  it("пустые значения проходят насквозь", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    expect(encryptField(null)).toBeNull();
    expect(encryptField("")).toBe("");
    expect(decryptField(null)).toBeNull();
  });

  it("незашифрованные (старые) записи читаются как есть", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    expect(decryptField("просто текст")).toBe("просто текст");
  });

  it("повреждённый шифртекст не роняет чтение", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const broken = "enc:v1:AAAA";
    expect(decryptField(broken)).toBe(broken);
  });
});

describe("телефон в профиле аккаунта", () => {
  it("шифруется и расшифровывается как телефон в заказе", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    const stored = encryptField("+79001234567") ?? "";
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(decryptProfile({ phone: stored, first_name: "Иван" })).toEqual({
      phone: "+79001234567",
      first_name: "Иван",
    });
  });

  it("аккаунты, заведённые до шифрования, продолжают читаться", () => {
    // Миграция не нужна: незашифрованное значение проходит насквозь.
    process.env.DATA_ENCRYPTION_KEY = KEY;
    expect(decryptProfile({ phone: "+79001234567" })).toEqual({
      phone: "+79001234567",
    });
  });

  it("без телефона отдаёт пустую строку, а не null", () => {
    process.env.DATA_ENCRYPTION_KEY = KEY;
    expect(decryptProfile({ phone: "" })).toEqual({ phone: "" });
  });
});
