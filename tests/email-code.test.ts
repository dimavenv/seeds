import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowAttempt,
  codeMatches,
  generateCode,
  issueTicket,
  readTicket,
} from "@/lib/email-code";

describe("билеты кода подтверждения", () => {
  it("выдаёт и читает билет", () => {
    const t = issueTicket("user@yandex.ru", "123456");
    const parsed = readTicket(t);
    expect(parsed).not.toBeNull();
    expect(parsed!.email).toBe("user@yandex.ru");
    expect(parsed!.code).toBe("123456");
    expect(parsed!.expired).toBe(false);
  });

  it("отклоняет повреждённый/подделанный билет", () => {
    const t = issueTicket("user@yandex.ru", "123456");
    expect(readTicket("")).toBeNull();
    expect(readTicket("not-a-ticket")).toBeNull();
    // порча последнего символа ломает GCM-целостность
    const tampered = t.slice(0, -2) + (t.endsWith("aa") ? "bb" : "aa");
    expect(readTicket(tampered)).toBeNull();
  });

  it("помечает истёкший билет", () => {
    vi.useFakeTimers();
    try {
      const t = issueTicket("user@yandex.ru", "123456");
      vi.advanceTimersByTime(16 * 60 * 1000); // TTL — 15 минут
      expect(readTicket(t)!.expired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("генерирует 6-значный код", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("сравнивает код без чувствительности к пробелам по краям", () => {
    const t = { email: "e", code: "123456", expired: false };
    expect(codeMatches(t, "123456")).toBe(true);
    expect(codeMatches(t, " 123456 ")).toBe(true);
    expect(codeMatches(t, "123457")).toBe(false);
    expect(codeMatches(t, "12345")).toBe(false);
  });
});

describe("allowAttempt (лимитер попыток)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("пропускает до лимита и блокирует сверх него", () => {
    const key = `test:${Math.random()}`;
    expect(allowAttempt(key, 3, 60_000)).toBe(true);
    expect(allowAttempt(key, 3, 60_000)).toBe(true);
    expect(allowAttempt(key, 3, 60_000)).toBe(true);
    expect(allowAttempt(key, 3, 60_000)).toBe(false);
  });

  it("сбрасывает окно по истечении времени", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 4; i++) allowAttempt(key, 3, 60_000);
    expect(allowAttempt(key, 3, 60_000)).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(allowAttempt(key, 3, 60_000)).toBe(true);
  });

  it("поток мусорных ключей не сбрасывает активный лимит", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 4; i++) allowAttempt(key, 3, 60_000);
    expect(allowAttempt(key, 3, 60_000)).toBe(false);
    // раньше >10 000 ключей вызывали clear() и обнуляли ВСЕ лимиты
    for (let i = 0; i < 11_000; i++) allowAttempt(`junk:${i}`, 3, 60_000);
    expect(allowAttempt(key, 3, 60_000)).toBe(false);
  });
});
