import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";
import {
  deliveryMethodLabel,
  normalizeDeliveryMethod,
  ozonRestrictedRegion,
  ozonRestrictedByRegionCode,
  ozonRestriction,
} from "@/lib/delivery";
import { isRussianEmail } from "@/lib/ru-email";
import { isValidRecordId } from "@/lib/pb/shared";

function reqWithXff(value?: string): Request {
  return new Request("http://localhost/api/test", {
    headers: value ? { "x-forwarded-for": value } : {},
  });
}

describe("clientIp", () => {
  it("без заголовка — undefined", () => {
    expect(clientIp(reqWithXff())).toBeUndefined();
  });

  it("берёт последний (добавленный nginx) элемент, а не подделанный первый", () => {
    expect(clientIp(reqWithXff("6.6.6.6, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(reqWithXff("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(reqWithXff("a, b , 10.0.0.1 "))).toBe("10.0.0.1");
  });
});

describe("normalizeDeliveryMethod", () => {
  it("известные значения проходят, мусор превращается в ozon", () => {
    expect(normalizeDeliveryMethod("post")).toBe("post");
    expect(normalizeDeliveryMethod("ozon")).toBe("ozon");
    expect(normalizeDeliveryMethod("dhl")).toBe("ozon");
    expect(normalizeDeliveryMethod(undefined)).toBe("ozon");
    expect(normalizeDeliveryMethod(42)).toBe("ozon");
  });

  it("подпись способа доставки", () => {
    expect(deliveryMethodLabel("post")).toBe("Почта России");
    expect(deliveryMethodLabel("unknown")).toBe("unknown");
    expect(deliveryMethodLabel(null)).toBe("—");
  });
});

describe("ozonRestrictedRegion", () => {
  it("запрещённые для Ozon регионы находятся по адресу", () => {
    expect(ozonRestrictedRegion("г Симферополь, ул Ленина, д 1")).toContain(
      "Крым"
    );
    expect(ozonRestrictedRegion("Республика Крым, Ялта")).toContain("Крым");
    expect(ozonRestrictedRegion("г Севастополь, ул Большая Морская")).toContain(
      "Севастополь"
    );
    expect(ozonRestrictedRegion("г Калининград, Ленинский пр-т")).toContain(
      "Калининград"
    );
    expect(
      ozonRestrictedRegion("Камчатский край, г Петропавловск-Камчатский")
    ).toContain("Камчат");
    // регистр не важен
    expect(ozonRestrictedRegion("КАЛИНИНГРАД")).not.toBeNull();
  });

  it("разрешённые адреса и пустые значения — null", () => {
    expect(ozonRestrictedRegion("г Краснодар, ул Красная, д 176")).toBeNull();
    expect(ozonRestrictedRegion("г Москва, ул Тверская, д 7")).toBeNull();
    expect(ozonRestrictedRegion("")).toBeNull();
    expect(ozonRestrictedRegion(null)).toBeNull();
    expect(ozonRestrictedRegion(undefined)).toBeNull();
  });
});

describe("ozonRestrictedByRegionCode (KLADR)", () => {
  it("запрещённые регионы по коду (первые 2 цифры KLADR)", () => {
    expect(ozonRestrictedByRegionCode("9100000000000")).toContain("Крым");
    expect(ozonRestrictedByRegionCode("9200000000000")).toContain("Севастополь");
    expect(ozonRestrictedByRegionCode("3900000000000")).toContain("Калининград");
    expect(ozonRestrictedByRegionCode("4100000000000")).toContain("Камчат");
    // Короткий 2-значный код тоже принимается.
    expect(ozonRestrictedByRegionCode("91")).toContain("Крым");
  });

  it("разрешённые/некорректные коды — null", () => {
    expect(ozonRestrictedByRegionCode("2300000000000")).toBeNull(); // Краснодар
    expect(ozonRestrictedByRegionCode("77")).toBeNull(); // Москва
    expect(ozonRestrictedByRegionCode("")).toBeNull();
    expect(ozonRestrictedByRegionCode(null)).toBeNull();
    expect(ozonRestrictedByRegionCode("ab")).toBeNull();
  });
});

describe("ozonRestriction (код региона приоритетнее текста)", () => {
  it("ловит нормализованный регион, который обошёл разбор текста", () => {
    // Свободный текст без ключевых слов (транслит), но код региона — Крым.
    expect(
      ozonRestriction({ regionKladrId: "9100000000000", address: "Simferopol, Lenina 1" })
    ).toContain("Крым");
  });

  it("падает обратно на текст, когда кода нет", () => {
    expect(
      ozonRestriction({ regionKladrId: null, address: "г Калининград, пр Мира" })
    ).toContain("Калининград");
  });

  it("разрешённый заказ — null", () => {
    expect(
      ozonRestriction({ regionKladrId: "2300000000000", address: "г Краснодар" })
    ).toBeNull();
  });
});

describe("isRussianEmail", () => {
  it("российские адреса", () => {
    expect(isRussianEmail("user@yandex.ru")).toBe(true);
    expect(isRussianEmail("user@yandex.com")).toBe(true);
    expect(isRussianEmail("user@mail.ru")).toBe(true);
    expect(isRussianEmail("user@custom-domain.ru")).toBe(true);
    expect(isRussianEmail("USER@BK.RU")).toBe(true);
  });

  it("иностранные и некорректные адреса", () => {
    expect(isRussianEmail("user@gmail.com")).toBe(false);
    expect(isRussianEmail("user@outlook.de")).toBe(false);
    expect(isRussianEmail("not-an-email")).toBe(false);
    expect(isRussianEmail("")).toBe(false);
  });
});

describe("isValidRecordId", () => {
  it("формат id PocketBase", () => {
    expect(isValidRecordId("abc123def456ghi")).toBe(true);
    expect(isValidRecordId("ABC123DEF456GHI")).toBe(true);
    expect(isValidRecordId("short")).toBe(false);
    expect(isValidRecordId("has spaces here!")).toBe(false);
    expect(isValidRecordId(42)).toBe(false);
    expect(isValidRecordId(null)).toBe(false);
  });
});
