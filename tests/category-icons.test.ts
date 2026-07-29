import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { categoryEmoji, getCategoryIcon } from "@/lib/categories";

// Иконки категорий стоят в круглых чипах каталога рядом друг с другом, и глаз
// сравнивает не размер файла, а размер самого рисунка. Стоит одной картинке
// упереться в край холста — в ряду она выглядит крупнее соседних и словно
// вылезает за чип. Ровно так и было с перцем сладким и кукурузой.
//
// Иконки приходят из внешнего редактора и заливаются руками, так что «не
// забыть прогнать npm run img:icons» — ненадёжная договорённость. Проверяем
// файлы тестом: нормализатор (scripts/normalize-category-icons.mjs) приводит их
// к этим же числам, поэтому упавший тест чинится одним запуском скрипта.

const CANVAS = 128;
const INK_MAX = 117;
// Допуски — те же, что в скрипте: на экране пиксель холста это 0.19 пикселя.
const SIZE_TOLERANCE = 1;
const CENTER_TOLERANCE = 2;
const ALPHA_THRESHOLD = 16;

const root = path.join(__dirname, "..");

/** Границы непрозрачной части картинки. */
async function inkBounds(file: string) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const slugs = Object.keys(categoryEmoji).filter((slug) => getCategoryIcon(slug));

describe("иконки категорий", () => {
  it("набор иконок не пустой — иначе проверять нечего", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it.each(slugs)("%s: файл лежит на месте", (slug) => {
    const file = path.join(root, "public", getCategoryIcon(slug)!);
    expect(fs.existsSync(file), `нет файла ${getCategoryIcon(slug)}`).toBe(true);
  });

  it.each(slugs)("%s: квадрат %dpx, рисунок вписан и стоит по центру", async (slug) => {
    const file = path.join(root, "public", getCategoryIcon(slug)!);
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([CANVAS, CANVAS]);

    const ink = await inkBounds(file);
    const longest = Math.max(ink.width, ink.height);
    // Длинная сторона рисунка — общая для всего набора: иначе одна иконка
    // выглядит крупнее соседних.
    expect(Math.abs(longest - INK_MAX)).toBeLessThanOrEqual(SIZE_TOLERANCE);

    const offX = ink.left - (CANVAS - ink.left - ink.width);
    const offY = ink.top - (CANVAS - ink.top - ink.height);
    expect(Math.abs(offX)).toBeLessThanOrEqual(CENTER_TOLERANCE);
    expect(Math.abs(offY)).toBeLessThanOrEqual(CENTER_TOLERANCE);
  });
});
