import { describe, expect, it, vi } from "vitest";
import { allowAttempt, allowForEmail } from "@/lib/email-code";

// Лимитер живёт в памяти модуля, поэтому у каждого теста должен быть свой
// ключ — иначе тесты влияли бы друг на друга.
let n = 0;
const uniq = () => `test-${Date.now()}-${n++}`;

describe("ограничение попыток", () => {
  it("пропускает заданное число попыток и отсекает следующие", () => {
    const key = uniq();
    for (let i = 0; i < 3; i++) {
      expect(allowAttempt(key, 3, 60_000)).toBe(true);
    }
    expect(allowAttempt(key, 3, 60_000)).toBe(false);
  });

  it("окно истекает — счётчик начинается заново", () => {
    // Время двигаем сами: ждать настоящие минуты в тестах незачем.
    vi.useFakeTimers();
    try {
      const key = uniq();
      const window = 10 * 60 * 1000;
      expect(allowAttempt(key, 1, window)).toBe(true);
      expect(allowAttempt(key, 1, window)).toBe(false);
      vi.advanceTimersByTime(window + 1);
      expect(allowAttempt(key, 1, window)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("счётчик по адресу почты не обнуляется сменой IP", () => {
    // Главный смысл этого лимита: у перебора и у «письмобомбёжки» адреса
    // меняются, а цель — один и тот же ящик.
    const action = uniq();
    const email = "victim@mail.ru";
    for (let i = 0; i < 5; i++) {
      expect(allowForEmail(action, email, 5, 60_000)).toBe(true);
    }
    expect(allowForEmail(action, email, 5, 60_000)).toBe(false);
  });

  it("адрес нормализуется: регистр и пробелы не дают обойти лимит", () => {
    const action = uniq();
    expect(allowForEmail(action, "Ivan@Mail.RU", 2, 60_000)).toBe(true);
    expect(allowForEmail(action, "  ivan@mail.ru  ", 2, 60_000)).toBe(true);
    expect(allowForEmail(action, "IVAN@MAIL.RU", 2, 60_000)).toBe(false);
  });

  it("разные адреса считаются отдельно", () => {
    const action = uniq();
    expect(allowForEmail(action, "a@mail.ru", 1, 60_000)).toBe(true);
    expect(allowForEmail(action, "a@mail.ru", 1, 60_000)).toBe(false);
    expect(allowForEmail(action, "b@mail.ru", 1, 60_000)).toBe(true);
  });

  it("разные действия не мешают друг другу", () => {
    // Неудачные попытки входа не должны съедать лимит на письма с кодом.
    const email = "user@mail.ru";
    const login = uniq();
    const code = uniq();
    expect(allowForEmail(login, email, 1, 60_000)).toBe(true);
    expect(allowForEmail(login, email, 1, 60_000)).toBe(false);
    expect(allowForEmail(code, email, 1, 60_000)).toBe(true);
  });

  it("пустой адрес не ограничивается", () => {
    const action = uniq();
    for (let i = 0; i < 10; i++) {
      expect(allowForEmail(action, "", 1, 60_000)).toBe(true);
    }
  });
});
