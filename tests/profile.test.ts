import { describe, expect, it } from "vitest";
import {
  formatLocalPhone,
  formatPhone,
  joinFullName,
  localPhoneDigits,
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

describe("поле ввода с готовым +7", () => {
  it("срезает код страны в любом написании", () => {
    for (const raw of [
      "+7 999 123-45-67",
      "8 (999) 123-45-67",
      "89991234567",
      "79991234567",
      "9991234567",
    ]) {
      expect(localPhoneDigits(raw)).toBe("9991234567");
    }
  });

  it("не трогает короткий ввод — человек ещё печатает", () => {
    expect(localPhoneDigits("")).toBe("");
    expect(localPhoneDigits("9")).toBe("9");
    // 8 в начале короткого номера — цифра номера, а не код страны
    expect(localPhoneDigits("8912345")).toBe("8912345");
  });

  it("не показывает код +7 внутри поля у неполного номера", () => {
    expect(localPhoneDigits("+7")).toBe("");
    expect(localPhoneDigits("+79")).toBe("9");
    expect(localPhoneDigits("+7 999 12")).toBe("99912");
    expect(formatLocalPhone("+79991")).toBe("999 1");
  });

  it("лишние цифры отбрасывает", () => {
    expect(localPhoneDigits("999123456789")).toBe("9991234567");
    expect(localPhoneDigits("899912345671234")).toBe("9991234567");
  });

  it("форматирует по мере ввода, без висящих разделителей", () => {
    expect(formatLocalPhone("")).toBe("");
    expect(formatLocalPhone("9")).toBe("9");
    expect(formatLocalPhone("999")).toBe("999");
    expect(formatLocalPhone("9991")).toBe("999 1");
    expect(formatLocalPhone("999123")).toBe("999 123");
    expect(formatLocalPhone("9991234")).toBe("999 123-4");
    expect(formatLocalPhone("999123456")).toBe("999 123-45-6");
    expect(formatLocalPhone("9991234567")).toBe("999 123-45-67");
    // уже сохранённый номер показывается так же
    expect(formatLocalPhone("+79991234567")).toBe("999 123-45-67");
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
