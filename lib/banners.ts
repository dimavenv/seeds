import { promises as fs } from "fs";
import path from "path";

// Список баннеров главной страницы: public/banners/1.jpg … 12.jpg.
// Читаем на сервере при рендере, чтобы клиент не «прощупывал» картинки
// (раньше браузер грузил все 12 кандидатов и ловил 404 на отсутствующих).
// В папке могут лежать текстовые заглушки с расширением .jpg — поэтому
// проверяем сигнатуру JPEG (FF D8), а не только имя файла.
export async function getBannerImages(): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "banners");
  const names = Array.from({ length: 12 }, (_, i) => `${i + 1}.jpg`);

  const checks = await Promise.all(
    names.map(async (name) => {
      try {
        const handle = await fs.open(path.join(dir, name), "r");
        try {
          const buf = Buffer.alloc(2);
          const { bytesRead } = await handle.read(buf, 0, 2, 0);
          return bytesRead === 2 && buf[0] === 0xff && buf[1] === 0xd8
            ? `/banners/${name}`
            : null;
        } finally {
          await handle.close();
        }
      } catch {
        return null; // файла нет
      }
    })
  );

  return checks.filter((src): src is string => src !== null);
}
