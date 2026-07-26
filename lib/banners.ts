import "server-only";
import fs from "node:fs";
import path from "node:path";

// Список баннеров главной страницы из public/banners — читается НА СЕРВЕРЕ
// (при сборке/ISR-перегенерации), а не пробингом ~12 URL из браузера на каждый
// визит, как раньше. Порядок прежний: по числовому имени файла (1.jpg, 2.jpg…).
// В standalone-деплое public/ докопируется рядом с сервером (deploy/update.sh),
// поэтому чтение работает и на VPS; при любой ошибке — пустой список, и
// компонент покажет запасной баннер.
export function getBannerImages(): string[] {
  try {
    const dir = path.join(process.cwd(), "public", "banners");
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d+\.(jpe?g|png|webp|avif)$/i.test(f))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((f) => `/banners/${f}`);
  } catch {
    return [];
  }
}
