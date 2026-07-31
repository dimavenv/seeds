import { describe, expect, it } from "vitest";
import { categoryDisplayName } from "@/lib/categories";
import { mapCategory, mapProduct } from "@/lib/pb/shared";
import { demoCategories } from "@/lib/demo-data";

// Категории на сайте называются в единственном числе. В базе может лежать
// старое множественное («Томаты») — подмена делается при показе, поэтому
// сайт не ждёт запуска npm run db:categories.

describe("categoryDisplayName", () => {
  it("переводит известные категории в единственное число", () => {
    expect(categoryDisplayName("tomaty", "Томаты")).toBe("Томат");
    expect(categoryDisplayName("baklazhany", "Баклажаны")).toBe("Баклажан");
    expect(categoryDisplayName("dynya", "Дыни")).toBe("Дыня");
    expect(categoryDisplayName("arbuz", "Арбузы")).toBe("Арбуз");
  });

  it("не зависит от регистра и лишних пробелов", () => {
    expect(categoryDisplayName("tomaty", "  ТОМАТЫ ")).toBe("Томат");
    expect(categoryDisplayName("tomaty", "томаты")).toBe("Томат");
  });

  it("уже единственное число оставляет как есть", () => {
    expect(categoryDisplayName("tomaty", "Томат")).toBe("Томат");
    expect(categoryDisplayName("kukuruza", "Кукуруза")).toBe("Кукуруза");
    expect(categoryDisplayName("kartofel", "Картофель")).toBe("Картофель");
  });

  it("не трогает свои названия из админки", () => {
    expect(categoryDisplayName("tomaty", "Томат черри")).toBe("Томат черри");
    expect(categoryDisplayName("tomaty", "Коллекция 2026")).toBe("Коллекция 2026");
    expect(categoryDisplayName("novaya", "Огурцы бочковые")).toBe("Огурцы бочковые");
  });
});

describe("названия категорий на сайте", () => {
  it("mapCategory отдаёт единственное число даже при старой записи в базе", () => {
    expect(mapCategory({ id: "x", slug: "tomaty", name: "Томаты" }).name).toBe("Томат");
    expect(mapCategory({ id: "x", slug: "baklazhany", name: "Баклажаны" }).name).toBe(
      "Баклажан"
    );
  });

  it("категория товара (хлебные крошки, карточка) — тоже в единственном", () => {
    const p = mapProduct({
      id: "p",
      slug: "tomat-test",
      name: "Томат «Тест»",
      expand: { category: { id: "c", slug: "tomaty", name: "Томаты" } },
    });
    expect(p.category?.name).toBe("Томат");
  });

  it("демо-каталог названы так же, как показывает сайт", () => {
    for (const c of demoCategories) {
      expect(categoryDisplayName(c.slug, c.name)).toBe(c.name);
    }
    expect(demoCategories.find((c) => c.slug === "tomaty")?.name).toBe("Томат");
    expect(demoCategories.find((c) => c.slug === "baklazhany")?.name).toBe("Баклажан");
  });
});
