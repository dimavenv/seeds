import { describe, expect, it } from "vitest";
import { getBannerImages, getBanners } from "@/lib/banners";

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

// Карусель показывает каждый баннер целиком, без обрезки: высота блока
// считается из настоящих пропорций файла (см. components/hero-banner).
// Значит, размеры обязаны быть настоящими, а не подставленными «на глаз».
describe("getBanners", () => {
  it("отдаёт настоящие размеры каждой картинки", async () => {
    const banners = await getBanners();
    expect(banners.length).toBe(getBannerImages().length);
    for (const b of banners) {
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      // Баннер — горизонтальная картинка; вертикальная означала бы, что
      // размеры прочитались неверно (перепутаны стороны).
      expect(b.width).toBeGreaterThan(b.height);
    }
  });

  it("повторный вызов отдаёт то же самое (работает кэш размеров)", async () => {
    expect(await getBanners()).toEqual(await getBanners());
  });
});
