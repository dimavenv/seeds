import { describe, expect, it } from "vitest";
import { getBannerImages } from "@/lib/banners";

// Тест читает НАСТОЯЩУЮ папку public/banners репозитория: в ней есть пропуски
// в нумерации (нет 1.jpg и 8.jpg) и двузначные имена — удобная проверка, что
// сортировка числовая (2 < 10), а не лексикографическая ("10" < "2").
describe("getBannerImages", () => {
  it("возвращает только картинки, по возрастанию номера", () => {
    const list = getBannerImages();
    expect(list.length).toBeGreaterThan(0);
    // README.txt и прочие не-картинки отфильтрованы.
    expect(list.every((u) => /^\/banners\/\d+\.(jpe?g|png|webp|avif)$/i.test(u))).toBe(true);
    const nums = list.map((u) => parseInt(u.replace("/banners/", ""), 10));
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });
});
