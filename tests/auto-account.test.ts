import { describe, expect, it } from "vitest";
import { generatePassword } from "@/lib/auto-account";

describe("пароль автоматически созданного аккаунта", () => {
  it("нужной длины и только из разрешённых символов", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      // Без неоднозначных символов: пароль нужно скопировать из письма.
      expect(p).toMatch(/^[a-zA-Z2-9]+$/);
      expect(p).not.toMatch(/[oOlI]/);
    }
  });

  it("длиннее минимума PocketBase (8 символов)", () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(8);
  });

  it("не повторяется", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generatePassword());
    expect(seen.size).toBe(200);
  });
});
