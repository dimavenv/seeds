import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { probeImage, safeBaseName } from "@/lib/media";

// Ошибки распознавания уходят в console.error — в выводе тестов они шум.
vi.spyOn(console, "error").mockImplementation(() => {});

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

// Настоящая картинка нужного формата — без неё проверка сигнатуры бессмысленна.
async function image(
  format: "png" | "jpeg" | "webp",
  width = 32
): Promise<ArrayBuffer> {
  const buf = await sharp({
    create: {
      width,
      height: 16,
      channels: 3,
      background: { r: 10, g: 120, b: 40 },
    },
  })
    .toFormat(format)
    .toBuffer();
  return toArrayBuffer(buf);
}

describe("проверка загружаемого файла по содержимому", () => {
  it("принимает настоящие PNG, JPEG и WebP", async () => {
    expect(await probeImage(await image("png"))).toMatchObject({
      mime: "image/png",
      ext: "png",
      width: 32,
    });
    expect(await probeImage(await image("jpeg"))).toMatchObject({
      mime: "image/jpeg",
    });
    expect(await probeImage(await image("webp"))).toMatchObject({
      mime: "image/webp",
    });
  });

  it("отклоняет SVG со скриптом, как бы он ни назывался", async () => {
    // sharp умеет читать SVG, поэтому формат распознаётся — и именно поэтому
    // важно, что его нет в списке разрешённых: иначе такой файл лёг бы рядом с
    // фото товаров и выполнился бы при открытии по прямой ссылке.
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16">` +
        `<script>alert(document.domain)</script></svg>`
    );
    expect(await probeImage(toArrayBuffer(svg))).toBeNull();
  });

  it("отклоняет HTML и произвольные данные, присланные под видом картинки", async () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    expect(await probeImage(toArrayBuffer(html))).toBeNull();
    expect(await probeImage(toArrayBuffer(Buffer.from([0, 1, 2, 3])))).toBeNull();
  });

  it("отклоняет полиглот: PNG-сигнатура спереди, HTML следом", async () => {
    // Файл, который проходит наивную проверку «начинается на \x89PNG», но
    // картинкой не является.
    const polyglot = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("<script>alert(1)</script>"),
    ]);
    expect(await probeImage(toArrayBuffer(polyglot))).toBeNull();
  });
});

describe("имя сохраняемого файла", () => {
  it("вычищает путь и расширение из имени, присланного загружающим", () => {
    expect(safeBaseName("../../etc/passwd.png")).toBe("etc-passwd");
    expect(safeBaseName("фото товара.JPG")).toBe("фото-товара");
    expect(safeBaseName("a/b\\c.png")).toBe("a-b-c");
  });

  it("никогда не отдаёт пустое имя и не даёт разрастаться", () => {
    expect(safeBaseName(".png")).toBe("photo");
    expect(safeBaseName("...")).toBe("photo");
    expect(safeBaseName(`${"x".repeat(200)}.png`)).toHaveLength(60);
  });
});
