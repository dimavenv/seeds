// Приводит иконки категорий (public/categories/*.webp) к одному виду.
//
//   node scripts/normalize-category-icons.mjs --dry-run   # только показать
//   node scripts/normalize-category-icons.mjs             # перезаписать файлы
//
// Зачем: в чипе каталога иконка стоит в круглой «пилюле», и на глаз сравнивается
// не размер файла, а размер самого рисунка. Если у одной картинки рисунок
// упирается в край холста, а у остальных вокруг него есть поле, эта иконка
// выглядит крупнее соседних и словно вылезает за границу чипа. Так было с
// перцем сладким и кукурузой: рисунок занимал все 128px по высоте, у остальных —
// 117 из 128.
//
// Скрипт находит границы непрозрачных пикселей, вписывает рисунок в INK_MAX и
// ставит его в центр холста CANVAS×CANVAS. Файлы, которые уже в норме, не
// трогает вообще — повторный запуск не пережимает их заново и не копит потерю
// качества (та же логика, что в scripts/optimize-public-images.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "public", "categories");
const DRY_RUN = process.argv.includes("--dry-run");

// Холст 128×128: иконка показывается в 20–24 CSS-пикселя, этого хватает и для
// экранов с четырёхкратной плотностью точек.
const CANVAS = 128;
// Сколько из холста занимает сам рисунок по длинной стороне. 117 — не выдумка:
// столько уже было у томата, картофеля, чили, баклажана, дыни и арбуза, то есть
// это фактический общий знаменатель набора.
const INK_MAX = 117;
// Пороги «уже в норме». Перезапись стоит ещё одного круга сжатия с потерями,
// поэтому ради незаметного глазу отличия её не делаем: на холсте 128px иконка
// показывается в 24 CSS-пикселя, то есть пиксель холста — это 0.19 пикселя на
// экране. Смещение центра прощаем чуть щедрее размера: у несимметричных
// рисунков (арбуз с хвостиком) центр контура и так не совпадает с центром массы.
const SIZE_TOLERANCE = 1;
const CENTER_TOLERANCE = 2;
// Порог прозрачности, ниже которого пиксель считается фоном. Не 0: у краёв
// рисунка остаётся почти прозрачная кайма от сглаживания, и по alpha > 0
// границы находились бы по ней, а не по видимому контуру.
const ALPHA_THRESHOLD = 16;

const QUALITY = 90;

/** Границы непрозрачной части: {left, top, width, height} или null. */
async function inkBounds(file) {
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
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

let changed = 0;
let skipped = 0;
let failed = 0;

let files;
try {
  files = fs.readdirSync(DIR).filter((f) => /\.webp$/i.test(f)).sort();
} catch {
  console.error(`Папки ${DIR} нет — нечего нормализовать.`);
  process.exit(1);
}

console.log(`Иконки категорий: холст ${CANVAS}px, рисунок до ${INK_MAX}px.\n`);

for (const name of files) {
  const file = path.join(DIR, name);
  try {
    const before = fs.statSync(file).size;
    const meta = await sharp(file).metadata();
    const ink = await inkBounds(file);
    if (!ink) {
      skipped++;
      console.log(`  = ${name}: пустая картинка, пропущена`);
      continue;
    }

    const longest = Math.max(ink.width, ink.height);
    // Отступы слева/сверху должны совпадать с правым/нижним — иначе рисунок
    // стоит не по центру и в круглом чипе это заметно.
    const offX = ink.left - (meta.width - ink.left - ink.width);
    const offY = ink.top - (meta.height - ink.top - ink.height);
    const isSquare = meta.width === CANVAS && meta.height === CANVAS;
    const fits = Math.abs(longest - INK_MAX) <= SIZE_TOLERANCE;
    const centered =
      Math.abs(offX) <= CENTER_TOLERANCE && Math.abs(offY) <= CENTER_TOLERANCE;

    if (isSquare && fits && centered) {
      skipped++;
      console.log(`  = ${name}: рисунок ${ink.width}×${ink.height} по центру — уже в норме`);
      continue;
    }

    const scale = INK_MAX / longest;
    const w = Math.max(1, Math.round(ink.width * scale));
    const h = Math.max(1, Math.round(ink.height * scale));
    const out = await sharp(file)
      .extract(ink)
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .extend({
        top: Math.floor((CANVAS - h) / 2),
        bottom: Math.ceil((CANVAS - h) / 2),
        left: Math.floor((CANVAS - w) / 2),
        right: Math.ceil((CANVAS - w) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: QUALITY, alphaQuality: 100 })
      .toBuffer();

    if (!DRY_RUN) fs.writeFileSync(file, out);
    changed++;
    console.log(
      `  ${DRY_RUN ? "→" : "✓"} ${name}: рисунок ${ink.width}×${ink.height} → ${w}×${h}` +
        ` (${(before / 1024).toFixed(1)} КБ → ${(out.length / 1024).toFixed(1)} КБ)`
    );
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

console.log(`\nИзменено: ${changed}, пропущено: ${skipped}, ошибок: ${failed}.`);
if (DRY_RUN) console.log("Пробный прогон: файлы не тронуты.");
process.exit(failed > 0 ? 1 : 0);
