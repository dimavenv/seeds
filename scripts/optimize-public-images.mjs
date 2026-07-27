// Ужимает картинки в public/ до размеров, в которых они реально показываются.
//
//   node scripts/optimize-public-images.mjs --dry-run   # только показать
//   node scripts/optimize-public-images.mjs             # перезаписать файлы
//
// Зачем: перевод в WebP сам по себе вес НЕ уменьшает, если картинка осталась
// в исходном разрешении. Баннер 4000px, пережатый в WebP без ужатия, весит
// БОЛЬШЕ исходного JPEG — а показывается всё равно максимум в 1280 CSS-пикселей.
// Выигрыш даёт именно уменьшение разрешения.
//
// Файлы перезаписываются на месте. Исходники остаются в истории git:
//   git checkout <коммит> -- public/banners
//
// Скрипт идемпотентен: готовый WebP нужной ширины пропускается, повторный
// запуск ничего не пережимает — иначе каждый прогон копил бы потерю качества.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

// Для каждой группы: максимальная ширина и качество WebP.
// Ширины взяты с запасом на экраны с удвоенной плотностью точек.
const GROUPS = [
  {
    label: "баннеры",
    dir: path.join(root, "public", "banners"),
    match: /^\d+\.(webp|jpe?g|png)$/i,
    maxWidth: 1920, // в вёрстке баннер не шире 1280 CSS-пикселей
    quality: 80,
  },
  {
    label: "логотипы",
    dir: path.join(root, "public"),
    match: /^logo(-dark)?\.(webp|png)$/i,
    maxWidth: 800, // в шапке логотип не шире 400 CSS-пикселей
    quality: 82,
  },
];

// Ниже этого порога исходник в jpg/png конвертировать не стоит — экономия не
// окупит потерю качества. К уже готовым .webp порог не применяется: там
// критерий один — ширина (см. ниже).
const SKIP_UNDER_BYTES = 120 * 1024;

let totalBefore = 0;
let totalAfter = 0;
let changed = 0;
let skipped = 0;
let failed = 0;

for (const group of GROUPS) {
  let files;
  try {
    files = fs.readdirSync(group.dir).filter((f) => group.match.test(f));
  } catch {
    continue; // папки нет — не страшно
  }
  if (files.length === 0) continue;

  console.log(`\n${group.label} (до ${group.maxWidth}px, качество ${group.quality}):`);
  files.sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));

  for (const name of files) {
    const file = path.join(group.dir, name);
    const before = fs.statSync(file).size;
    totalBefore += before;

    try {
      const meta = await sharp(file).metadata();
      const width = meta.width ?? 0;
      const isWebp = /\.webp$/i.test(name);

      // Идемпотентность: если это уже WebP нужной ширины — не трогаем ВООБЩЕ.
      // Условие именно такое, а не «файл достаточно мал»: пережатие уже сжатого
      // WebP даёт лишь ~1% веса, зато каждый прогон добавляет потерю качества,
      // и повторные запуски незаметно портили бы картинки.
      const alreadyOptimal = isWebp && width <= group.maxWidth;
      const tooSmallToBother = !isWebp && before < SKIP_UNDER_BYTES;
      if (alreadyOptimal || tooSmallToBother) {
        totalAfter += before;
        skipped++;
        console.log(`  = ${name}: ${(before / 1024).toFixed(0)} КБ, ${width}px — уже в норме`);
        continue;
      }

      const out = await sharp(file)
        .rotate() // EXIF-ориентация
        .resize({ width: group.maxWidth, withoutEnlargement: true })
        .webp({ quality: group.quality })
        .toBuffer();

      // Пережали, а стало не легче — оставляем как было.
      if (out.length >= before) {
        totalAfter += before;
        skipped++;
        console.log(`  = ${name}: пережатие не выгодно, оставлен как есть`);
        continue;
      }

      const target = file.replace(/\.(jpe?g|png)$/i, ".webp");
      if (!DRY_RUN) {
        fs.writeFileSync(target, out);
        // Исходник в другом формате удаляем, иначе рядом останутся два файла.
        if (target !== file) fs.unlinkSync(file);
      }
      totalAfter += out.length;
      changed++;
      console.log(
        `  ${DRY_RUN ? "→" : "✓"} ${name}: ${(before / 1024).toFixed(0)} КБ → ` +
          `${(out.length / 1024).toFixed(0)} КБ  (${width}px → ` +
          `${Math.min(width, group.maxWidth)}px, −${(100 - (out.length / before) * 100).toFixed(0)}%)`
      );
    } catch (e) {
      failed++;
      totalAfter += before;
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(
  `\nИтого: было ${mb(totalBefore)} МБ → стало ${mb(totalAfter)} МБ ` +
    `(экономия ${mb(totalBefore - totalAfter)} МБ). ` +
    `Изменено: ${changed}, пропущено: ${skipped}, ошибок: ${failed}.`
);
if (DRY_RUN) console.log("Пробный прогон: файлы не тронуты.");
process.exit(failed > 0 ? 1 : 0);
