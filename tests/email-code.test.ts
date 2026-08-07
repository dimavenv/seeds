import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowAttempt,
  codeMatches,
  generateCode,
  issueTicket,
  readTicket,
  secondsLeft,
  ttlMs,
} from "@/lib/email-code";

describe("билеты кода подтверждения", () => {
  it("выдаёт и читает билет", () => {
    const t = issueTicket("user@yandex.ru", "123456");
    const parsed = readTicket(t);
    expect(parsed).not.toBeNull();
    expect(parsed!.email).toBe("user@yandex.ru");
    expect(parsed!.codes.map((c) => c.code)).toEqual(["123456"]);
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
      expect(ttlMs()).toBe(5 * 60 * 1000); // по умолчанию — 5 минут
      vi.advanceTimersByTime(ttlMs() + 1000);
      expect(readTicket(t)!.expired).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("срок кода настраивается через EMAIL_CODE_TTL_MIN", () => {
    const prev = process.env.EMAIL_CODE_TTL_MIN;
    try {
      process.env.EMAIL_CODE_TTL_MIN = "15";
      expect(ttlMs()).toBe(15 * 60 * 1000);
      // мусор и выход за границы — возврат к безопасным 5 минутам
      process.env.EMAIL_CODE_TTL_MIN = "нет";
      expect(ttlMs()).toBe(5 * 60 * 1000);
      process.env.EMAIL_CODE_TTL_MIN = "999";
      expect(ttlMs()).toBe(5 * 60 * 1000);
    } finally {
      if (prev === undefined) delete process.env.EMAIL_CODE_TTL_MIN;
      else process.env.EMAIL_CODE_TTL_MIN = prev;
    }
  });

  it("повторная отправка не гасит прежний код (письма приходят с задержкой)", () => {
    vi.useFakeTimers();
    try {
      const first = readTicket(issueTicket("user@mail.ru", "111111"))!;
      // покупатель ждал минуту и нажал «отправить ещё раз»
      vi.advanceTimersByTime(60 * 1000);
      const second = readTicket(
        issueTicket("user@mail.ru", "222222", first)
      )!;
      expect(codeMatches(second, "111111")).toBe(true);
      expect(codeMatches(second, "222222")).toBe(true);

      // но старый код живёт свой срок, а не срок нового
      vi.advanceTimersByTime(4 * 60 * 1000 + 1000);
      expect(codeMatches(second, "111111")).toBe(false);
      expect(codeMatches(second, "222222")).toBe(true);
      expect(readTicket(issueTicket("user@mail.ru", "222222", second))!.expired).toBe(
        false
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("хранит не больше трёх кодов", () => {
    let t = readTicket(issueTicket("user@mail.ru", "111111"))!;
    for (const code of ["222222", "333333", "444444"]) {
      t = readTicket(issueTicket("user@mail.ru", code, t))!;
    }
    expect(t.codes.map((c) => c.code)).toEqual(["222222", "333333", "444444"]);
    expect(codeMatches(t, "111111")).toBe(false);
  });

  it("коды из билета другой почты не переносятся", () => {
    const mine = readTicket(issueTicket("a@mail.ru", "111111"))!;
    const other = readTicket(issueTicket("b@mail.ru", "222222", mine))!;
    expect(other.codes.map((c) => c.code)).toEqual(["222222"]);
  });

  it("считает остаток времени на ввод", () => {
    vi.useFakeTimers();
    try {
      const t = readTicket(issueTicket("user@yandex.ru", "123456"))!;
      expect(secondsLeft(t)).toBe(300);
      vi.advanceTimersByTime(120 * 1000);
      expect(secondsLeft(t)).toBe(180);
      vi.advanceTimersByTime(200 * 1000);
      expect(secondsLeft(t)).toBe(0);
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
    const t = {
      email: "e",
      codes: [{ code: "123456", expiresAt: Date.now() + 60_000 }],
      expired: false,
    };
    expect(codeMatches(t, "123456")).toBe(true);
    expect(codeMatches(t, " 123456 ")).toBe(true);
    expect(codeMatches(t, "123457")).toBe(false);
    expect(codeMatches(t, "12345")).toBe(false);
  });

  it("истёкший код не подходит, даже если он в билете", () => {
    const t = {
      email: "e",
      codes: [{ code: "123456", expiresAt: Date.now() - 1 }],
      expired: true,
    };
    expect(codeMatches(t, "123456")).toBe(false);
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
