import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";
import { fileUrl } from "@/lib/pb/shared";
import { probeImage, safeBaseName } from "@/lib/media";
import {
  VARIANT_WIDTHS,
  variantField,
  type VariantWidth,
} from "@/lib/image-variants";

export const dynamic = "force-dynamic";
// Пережатие большого фото занимает секунды — стандартных 10 с на маршрут мало.
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // как maxSize поля file в коллекции media

// Загрузка фото товара из админки.
//
// Раньше браузер отправлял файл напрямую в PocketBase. Теперь он идёт через
// сервер, чтобы РОВНО ОДИН РАЗ, в момент загрузки, сделать WebP-варианты на
// 400/800/1200 px. Оптимизатор Next при этом остаётся выключенным: пережимать
// на каждый запрос на одном VPS нечем.
//
// Оригинал сохраняется всегда и остаётся тем, что показывается по умолчанию,
// поэтому сбой пережатия не ломает загрузку — фото просто останется без
// облегчённых вариантов.
export async function POST(request: Request) {
  // Запрос обязан прийти с нашей же страницы (см. lib/csrf.ts).
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "Файл больше 10 МБ" },
      { status: 413 }
    );

  const original = await file.arrayBuffer();

  // Что это за файл, решаем по СОДЕРЖИМОМУ, а не по заявленному Content-Type
  // (см. lib/media.ts).
  const probe = await probeImage(original);
  if (!probe) {
    return NextResponse.json(
      { error: "Поддерживаются JPEG, PNG, WebP и AVIF" },
      { status: 415 }
    );
  }

  // Варианты делаем до записи в базу: если sharp не справился с пережатием
  // (экзотический профиль, нехватка памяти), запись всё равно создастся — с
  // одним оригиналом.
  const variants = await buildVariants(original, probe.width);

  try {
    const pb = await pbAdmin();
    const payload = new FormData();
    const base = safeBaseName(file.name);
    payload.append(
      "file",
      new Blob([original], { type: probe.mime }),
      `${base}.${probe.ext}`
    );
    for (const [width, buffer] of variants) {
      payload.append(
        variantField(width),
        new Blob([buffer], { type: "image/webp" }),
        `${base}-${width}.webp`
      );
    }

    const record = await pb.collection("media").create(payload);
    const urls: Record<string, string> = {};
    for (const [width] of variants) {
      const name = record[variantField(width)];
      if (typeof name === "string" && name)
        urls[String(width)] = fileUrl("media", record.id, name);
    }

    return NextResponse.json({
      url: fileUrl("media", record.id, String(record.file)),
      variants: urls,
    });
  } catch (e) {
    console.error("[media] загрузка не удалась:", e);
    return NextResponse.json(
      { error: "Не удалось сохранить фото" },
      { status: 503 }
    );
  }
}

// WebP в трёх ширинах. Картинку только уменьшаем: растягивать фото 600 px до
// 1200 px бессмысленно — вес вырастет, чёткость нет (withoutEnlargement).
async function buildVariants(
  original: ArrayBuffer,
  width: number
): Promise<[VariantWidth, ArrayBuffer][]> {
  const out: [VariantWidth, ArrayBuffer][] = [];
  const input = Buffer.from(original);

  for (const target of VARIANT_WIDTHS) {
    // Вариант шире оригинала не нужен; самый маленький делаем всегда, иначе
    // у крошечных картинок не будет ни одного WebP.
    if (width && target > width && target !== VARIANT_WIDTHS[0]) continue;
    try {
      const webp = await sharp(input)
        .rotate() // EXIF-ориентация: иначе фото с телефона ложится набок
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      // Отдаём ArrayBuffer: Blob принимает его напрямую, а Buffer из Node
      // типизирован шире и в BlobPart не проходит.
      out.push([
        target,
        webp.buffer.slice(
          webp.byteOffset,
          webp.byteOffset + webp.byteLength
        ) as ArrayBuffer,
      ]);
    } catch (e) {
      // Один неудавшийся размер не должен рушить остальные и саму загрузку.
      console.error(`[media] вариант ${target}px не сгенерирован:`, e);
    }
  }
  return out;
}
