import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";
import {
  deliveryMethodLabel,
  normalizeDeliveryMethod,
  ozonRestrictedRegion,
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
