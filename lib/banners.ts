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

// ===== Размеры баннеров =====
//
// Карусель показывает каждую картинку ЦЕЛИКОМ, без обрезки: высота блока
// подстраивается под пропорции текущего баннера (см. components/hero-banner).
// Для этого нужны настоящие ширина и высота файла — их и отдаёт getBanners().
//
// Зачем: у загруженных баннеров пропорции разные (от 1.7:1 до 2.2:1), а блок
// раньше был жёстко 16:6 с object-cover — у самых высоких срезало больше трети
// кадра.

export type Banner = { src: string; width: number; height: number };

// Если размеры прочитать не удалось — показываем в привычных 16:6. Лучше один
// баннер не в своих пропорциях, чем пустая главная.
const FALLBACK_SIZE = { width: 1600, height: 600 };

// Кэш «файл + время правки + размер → размеры картинки»: страница
// перегенерируется раз в минуту (ISR), и читать заголовки одних и тех же
// файлов каждый раз незачем. Ключ включает mtime и размер файла, поэтому
// заменённая картинка читается заново.
const sizeCache = new Map<string, { width: number; height: number }>();

async function imageSize(file: string): Promise<{ width: number; height: number }> {
  let key = file;
  try {
    const st = fs.statSync(file);
    key = `${file}:${st.mtimeMs}:${st.size}`;
  } catch {
    /* файла нет — сработает запасной размер ниже */
  }
  const cached = sizeCache.get(key);
  if (cached) return cached;

  try {
    // sharp уже есть в зависимостях (им же Next оптимизирует картинки).
    // Читает только заголовок файла, пиксели не декодирует.
    const sharp = (await import("sharp")).default;
    const meta = await sharp(file).metadata();
    if (meta.width && meta.height) {
      const size = { width: meta.width, height: meta.height };
      sizeCache.set(key, size);
      return size;
    }
  } catch (e) {
    console.error(`[banners] не удалось прочитать размеры ${file}:`, e);
  }
  sizeCache.set(key, FALLBACK_SIZE);
  return FALLBACK_SIZE;
}

export async function getBanners(): Promise<Banner[]> {
  return Promise.all(
    getBannerImages().map(async (src) => ({
      src,
      ...(await imageSize(path.join(process.cwd(), "public", src))),
    }))
  );
}
