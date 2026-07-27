import "server-only";
import fs from "node:fs";
import path from "node:path";

// Список баннеров главной страницы из public/banners — читается НА СЕРВЕРЕ
// (при сборке/ISR-перегенерации), а не пробингом ~12 URL из браузера на каждый
// визит, как раньше. Порядок прежний: по числовому имени файла (1.webp, 2.webp…).
// В standalone-деплое public/ докопируется рядом с сервером (deploy/update.sh),
// поэтому чтение работает и на VPS; при любой ошибке — пустой список, и
// компонент покажет запасной баннер.
//
// Формат любой из перечисленных: при переходе на .webp старые .jpg можно
// удалять постепенно, карусель соберёт то, что есть.

// Файл меньше килобайта картинкой быть не может. Отсекаем такие явно: в
// репозитории лежали двухбайтовые файлы-заглушки (10.jpg, 11.jpg и другие), и
// карусель честно показывала их как БИТЫЕ слайды. Та же защита нужна и при
// переходе на .webp — если рядом с новыми файлами останутся старые пустышки.
const MIN_IMAGE_BYTES = 1024;

export function getBannerImages(): string[] {
  try {
    const dir = path.join(process.cwd(), "public", "banners");
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.(webp|jpe?g|png|avif)$/i.test(f))
      .filter((f) => {
        try {
          return fs.statSync(path.join(dir, f)).size >= MIN_IMAGE_BYTES;
        } catch {
          return false;
        }
      })
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((f) => `/banners/${f}`);
  } catch {
    return [];
  }
}
