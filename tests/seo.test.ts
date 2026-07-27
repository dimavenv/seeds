import { afterEach, describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";
import { descriptionParagraphs, truncateForMeta } from "@/lib/product-text";
import { absoluteUrl, siteUrl, verificationCodes } from "@/lib/seo";

describe("slugify", () => {
  it("транслитерирует название сорта в адрес карточки", () => {
    expect(slugify("Томат Бычье сердце")).toBe("tomat-byche-serdtse");
    expect(slugify("Перец Джимми Нардello")).toBe("perets-dzhimmi-nardello");
  });

  it("схлопывает разделители и не оставляет дефисов по краям", () => {
    expect(slugify("  Дыня «Медовая» — F1!  ")).toBe("dynya-medovaya-f1");
  });

  it("обрезает длинное название, не оставляя висящий дефис", () => {
    const long = slugify("Т".repeat(30) + " " + "о".repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("на названии без латиницы и цифр отдаёт пустую строку — вызывающий код подставляет запасной слаг", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("descriptionParagraphs", () => {
  it("разбивает описание по пустой строке", () => {
    expect(descriptionParagraphs("Первый абзац.\n\n  Второй абзац.")).toEqual([
      "Первый абзац.",
      "Второй абзац.",
    ]);
  });

  it("одиночный перевод строки остаётся внутри абзаца", () => {
    expect(descriptionParagraphs("Срок созревания:\n110 дней")).toEqual([
      "Срок созревания:\n110 дней",
    ]);
  });

  it("пустое описание — пустой список (секция не рендерится)", () => {
    expect(descriptionParagraphs(null)).toEqual([]);
    expect(descriptionParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("truncateForMeta", () => {
  it("короткий текст отдаётся как есть, но со схлопнутыми пробелами", () => {
    expect(truncateForMeta("Сорт   среднеспелый.\nУрожайный.")).toBe(
      "Сорт среднеспелый. Урожайный."
    );
  });

  it("длинный текст режется по границе слова и не длиннее лимита с многоточием", () => {
    const out = truncateForMeta("слово ".repeat(50), 40);
    expect(out.length).toBeLessThanOrEqual(41); // 40 символов + многоточие
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("сло…"); // не рвём посреди слова
  });

  it("длинное слово без пробелов режется жёстко, а не игнорирует лимит", () => {
    expect(truncateForMeta("а".repeat(100), 20)).toBe(`${"а".repeat(20)}…`);
  });
});

describe("siteUrl", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = saved.NEXT_PUBLIC_SITE_URL;
    process.env.SITE_URL = saved.SITE_URL;
    process.env.YANDEX_VERIFICATION = saved.YANDEX_VERIFICATION;
    process.env.GOOGLE_SITE_VERIFICATION = saved.GOOGLE_SITE_VERIFICATION;
  });

  it("берёт адрес из окружения и снимает завершающий слэш", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://stage.example.com/";
    expect(siteUrl()).toBe("https://stage.example.com");
    expect(absoluteUrl("/catalog")).toBe("https://stage.example.com/catalog");
    // Путь без ведущего слэша тоже должен давать корректный адрес.
    expect(absoluteUrl("sitemap.xml")).toBe(
      "https://stage.example.com/sitemap.xml"
    );
  });

  it("без NEXT_PUBLIC_SITE_URL падает на SITE_URL, затем на боевой домен", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.SITE_URL = "https://other.example.com";
    expect(siteUrl()).toBe("https://other.example.com");
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe("https://tomatsemena.ru");
  });
});

describe("verificationCodes", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.YANDEX_VERIFICATION = saved.YANDEX_VERIFICATION;
    process.env.GOOGLE_SITE_VERIFICATION = saved.GOOGLE_SITE_VERIFICATION;
  });

  it("пустые переменные не превращаются в пустые мета-теги", () => {
    process.env.YANDEX_VERIFICATION = "";
    process.env.GOOGLE_SITE_VERIFICATION = "   ";
    expect(verificationCodes()).toEqual({});
  });

  it("заданные коды попадают в мету", () => {
    process.env.YANDEX_VERIFICATION = "abc123";
    delete process.env.GOOGLE_SITE_VERIFICATION;
    expect(verificationCodes()).toEqual({ yandex: "abc123" });
  });
});
