import { describe, expect, it } from "vitest";
import {
  formatPhone,
  joinFullName,
  normalizePhone,
  parseProfile,
  profileFromRecord,
  splitFullName,
} from "@/lib/profile";

describe("ФИО", () => {
  it("разбирает строку в фамилию, имя и отчество", () => {
    expect(splitFullName("Иванов Иван Иванович")).toEqual({
      last_name: "Иванов",
      first_name: "Иван",
      middle_name: "Иванович",
    });
    expect(splitFullName("Иванов Иван")).toEqual({
      last_name: "Иванов",
      first_name: "Иван",
      middle_name: "",
    });
    expect(splitFullName("  Иванов   ")).toEqual({
      last_name: "Иванов",
      first_name: "",
      middle_name: "",
    });
    expect(splitFullName("")).toEqual({
      last_name: "",
      first_name: "",
      middle_name: "",
    });
  });

  it("лишние слова не теряются — уходят в отчество", () => {
    expect(splitFullName("Иванов Иван Иванович Младший").middle_name).toBe(
      "Иванович Младший"
    );
  });

  it("собирает обратно, пропуская пустые части", () => {
    expect(joinFullName({ last_name: "Иванов", first_name: "Иван" })).toBe(
      "Иванов Иван"
    );
    expect(joinFullName({})).toBe("");
    expect(joinFullName(splitFullName("Иванов Иван Иванович"))).toBe(
      "Иванов Иван Иванович"
    );
  });
});

describe("телефон", () => {
  it("приводит российские записи к +7XXXXXXXXXX", () => {
    for (const raw of [
      "+7 999 123-45-67",
      "8 (999) 123-45-67",
      "89991234567",
      "79991234567",
      "9991234567",
    ]) {
      expect(normalizePhone(raw)).toBe("+79991234567");
    }
  });

  it("непохожее на номер отбрасывает", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("телефон")).toBe("");
    expect(normalizePhone("123")).toBe("");
  });

  it("показывает номер человеческим", () => {
    expect(formatPhone("89991234567")).toBe("+7 999 123-45-67");
    // неразобранное оставляем как есть — пусть покупатель поправит сам
    expect(formatPhone("добавочный 12")).toBe("добавочный 12");
  });
});

describe("parseProfile", () => {
  it("нормализует поля", () => {
    const { profile, error } = parseProfile({
      last_name: "  Иванов  ",
      first_name: "Иван",
      middle_name: "Иванович",
      phone: "8 999 123-45-67",
    });
    expect(error).toBeNull();
    expect(profile).toEqual({
      last_name: "Иванов",
      first_name: "Иван",
      middle_name: "Иванович",
      phone: "+79991234567",
    });
  });

  it("пустая форма — не ошибка", () => {
    expect(parseProfile({}).error).toBeNull();
  });

  it("половина ФИО и кривой телефон отклоняются", () => {
    expect(parseProfile({ last_name: "Иванов" }).error).toBe(
      "Укажите и фамилию, и имя"
    );
    expect(parseProfile({ phone: "звоните" }).error).toContain("+7");
  });
});

describe("profileFromRecord", () => {
  it("берёт раздельные поля, когда они заполнены", () => {
    expect(
      profileFromRecord({
        name: "Старое Значение",
        last_name: "Иванов",
        first_name: "Иван",
        middle_name: "",
        phone: "+79991234567",
      })
    ).toEqual({
      last_name: "Иванов",
      first_name: "Иван",
      middle_name: "",
      phone: "+79991234567",
    });
  });

  it("для старых аккаунтов разбирает name", () => {
    expect(profileFromRecord({ name: "Иванов Иван Иванович" })).toEqual({
      last_name: "Иванов",
      first_name: "Иван",
      middle_name: "Иванович",
      phone: "",
    });
  });

  it("пустая запись — пустой профиль", () => {
    expect(profileFromRecord({})).toEqual({
      last_name: "",
      first_name: "",
      middle_name: "",
      phone: "",
    });
  });
});
