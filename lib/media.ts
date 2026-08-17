import "server-only";
import sharp from "sharp";

// Проверка загружаемых картинок. Живёт отдельно от маршрута
// (app/api/admin/media/route.ts), чтобы её можно было прогнать тестами: это
// граница доверия, и «работает ли она» должно проверяться, а не полагаться на
// внимательность при следующей правке загрузчика.

// Что считаем картинкой — по РАСПОЗНАННОМУ формату, а не по заявленному типу.
// Ключи — то, что возвращает sharp в metadata().format; значения — mime, под
// которым файл уедет в PocketBase.
export const ALLOWED_FORMATS: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  // sharp называет AVIF старым именем контейнера; HEIC с таким же форматом
  // отсеет уже PocketBase — в коллекции media разрешён только image/avif.
  heif: "image/avif",
};

export type ProbedImage = { mime: string; ext: string; width: number };

// Распознавание формата по содержимому файла. null — это не картинка из
// разрешённого списка (или файл битый): такой загружать нельзя.
//
// Почему по содержимому: Content-Type и расширение присылает браузер, то есть
// в конечном счёте загружающий. С «image/png» на входе так же спокойно
// приезжали бы SVG со скриптом внутри или HTML-страница, а лежали бы они потом
// на том же origin, что и фото товаров. sharp читает сигнатуру формата, и то
// же чтение даёт ширину для вариантов — отдельной проверки не нужно.
export async function probeImage(
  original: ArrayBuffer
): Promise<ProbedImage | null> {
  let format: string | undefined;
  let width = 0;
  try {
    const meta = await sharp(Buffer.from(original)).metadata();
    format = meta.format;
    width = meta.width ?? 0;
  } catch (e) {
    console.error("[media] не удалось прочитать изображение:", e);
    return null;
  }
  const mime = format ? ALLOWED_FORMATS[format] : undefined;
  if (!mime) {
    console.error(`[media] отклонён файл формата «${format ?? "неизвестно"}»`);
    return null;
  }
  return { mime, ext: mime.slice("image/".length), width };
}

// Имя файла придумывает загружающий, а оно попадает в имена сохранённых
// файлов и вариантов. Оставляем только буквы, цифры, дефис и подчёркивание:
// ни точек-расширений, ни слэшей (../), ни пробелов.
export function safeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 60) || "photo";
}
