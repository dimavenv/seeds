import { describe, expect, it } from "vitest";
import {
  normalizeSearch,
  searchFilter,
  searchScore,
  searchTokens,
} from "@/lib/search";

const p = (name: string, description?: string) => ({ name, description });

describe("нормализация запроса", () => {
  it("снимает регистр и разницу ё/е", () => {
    expect(normalizeSearch("ЧЁРНЫЙ Принц")).toBe("черный принц");
    expect(normalizeSearch("чЕрРи")).toBe("черри");
  });

  it("схлопывает знаки и пробелы", () => {
    expect(normalizeSearch("  Томат,   черри!  ")).toBe("томат черри");
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("!!!")).toBe("");
  });

  it("разбивает на слова", () => {
    expect(searchTokens("Чёрный  Принц")).toEqual(["черный", "принц"]);
    expect(searchTokens("   ")).toEqual([]);
  });
});

describe("поиск по каталогу", () => {
  const catalog = [
    p("Томат Чёрный Принц", "Тёмноплодный сорт для теплицы"),
    p("Томат Черри Блосэм", "Мелкоплодный, очень сладкий"),
    p("Перец Огонёк", "Острый, подходит для подоконника"),
    p("Баклажан Алмаз", "Классический сорт, томатам хороший сосед"),
  ];
  const names = (q: string) => searchFilter(catalog, q).map((x) => x.name);

  it("не зависит от регистра — то, ради чего всё затевалось", () => {
    expect(names("томат")).toEqual(names("ТОМАТ"));
    expect(names("ТоМаТ")).toEqual(names("томат"));
    expect(names("томат").length).toBeGreaterThan(0);
  });

  it("не различает е и ё в обе стороны", () => {
    expect(names("огонек")).toEqual(["Перец Огонёк"]);
    expect(names("Огонёк")).toEqual(["Перец Огонёк"]);
    expect(names("чёрный")).toEqual(["Томат Чёрный Принц"]);
  });

  it("находит по нескольким словам в любом порядке", () => {
    expect(names("чёрный принц")).toEqual(["Томат Чёрный Принц"]);
    expect(names("принц чёрный")).toEqual(["Томат Чёрный Принц"]);
    // слова из разных частей названия
    expect(names("томат блосэм")).toEqual(["Томат Черри Блосэм"]);
  });

  it("ищет и по описанию", () => {
    expect(names("теплиц")).toEqual(["Томат Чёрный Принц"]);
    expect(names("подоконник")).toEqual(["Перец Огонёк"]);
  });

  it("совпадение в названии важнее, чем в описании", () => {
    // «Баклажан Алмаз» упоминает томаты только в описании — он должен быть
    // ниже настоящих томатов.
    const found = names("томат");
    expect(found[found.length - 1]).toBe("Баклажан Алмаз");
    expect(found.slice(0, 2)).toEqual([
      "Томат Чёрный Принц",
      "Томат Черри Блосэм",
    ]);
  });

  it("не подходит, если хотя бы одно слово не нашлось", () => {
    expect(names("томат кабачок")).toEqual([]);
    expect(names("кабачок")).toEqual([]);
  });

  it("пустой запрос ничего не отсеивает", () => {
    expect(searchFilter(catalog, "").length).toBe(catalog.length);
    expect(searchFilter(catalog, "   ").length).toBe(catalog.length);
  });

  it("счёт нулевой у неподходящего товара", () => {
    expect(searchScore(p("Перец Огонёк"), ["томат"])).toBe(0);
    expect(searchScore(p("Томат Черри"), ["томат"])).toBeGreaterThan(0);
  });
});
