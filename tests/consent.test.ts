import { describe, expect, it } from "vitest";
import { hasConsent, PRIVACY_POLICY_VERSION } from "@/lib/consent";

describe("согласие на обработку персональных данных", () => {
  it("принимает только явное согласие", () => {
    expect(hasConsent(true)).toBe(true);
    expect(hasConsent("true")).toBe(true);
    expect(hasConsent("on")).toBe(true);
  });

  it("отсутствие поля — это отказ, а не «наверное, согласился»", () => {
    // Именно эта строчка отличает настоящую проверку от вежливой: клиент,
    // который просто не прислал поле, согласия не давал.
    expect(hasConsent(undefined)).toBe(false);
    expect(hasConsent(null)).toBe(false);
    expect(hasConsent(false)).toBe(false);
    expect(hasConsent("")).toBe(false);
    expect(hasConsent("false")).toBe(false);
    expect(hasConsent(0)).toBe(false);
    expect(hasConsent({})).toBe(false);
    expect(hasConsent([])).toBe(false);
  });

  it("версия политики задана датой редакции", () => {
    // По версии потом видно, с каким текстом соглашался покупатель, — значит,
    // она обязана меняться вместе с текстом на /privacy.
    expect(PRIVACY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
