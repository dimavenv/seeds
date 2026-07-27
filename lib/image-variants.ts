// Облегчённые варианты фото товара: WebP в трёх ширинах.
//
// Зачем не оптимизатор Next: он пережимает картинку на КАЖДЫЙ запрос (и потом
// держит кэш), а сайт живёт на одном VPS — это заметный расход CPU и памяти.
// Поэтому images.unoptimized остаётся включённым, а варианты генерируются
// РОВНО ОДИН РАЗ: при загрузке фото в админке (app/api/admin/media) и
// скриптом для уже загруженных (scripts/pb-backfill-image-variants.mjs).
//
// WebP при сопоставимом качестве весит примерно на 25–35% меньше JPEG, а три
// ширины позволяют телефону не тянуть картинку под десктоп.

export const VARIANT_WIDTHS = [400, 800, 1200] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

// Поле коллекции media, в котором лежит вариант нужной ширины.
export function variantField(width: VariantWidth): `w${VariantWidth}` {
  return `w${width}` as const;
}

// Карта «адрес оригинала → адреса вариантов». Хранится в products.image_variants.
// Ключи вариантов — ширина строкой, так как это JSON.
export type ImageVariantMap = Record<string, Partial<Record<string, string>>>;

// Варианты для конкретного фото. Пустой объект — вариантов нет, показываем
// оригинал (так ведут себя все фото, загруженные до этой доработки).
export function variantsFor(
  map: ImageVariantMap | null | undefined,
  originalUrl: string | null | undefined
): Partial<Record<string, string>> {
  if (!map || !originalUrl) return {};
  const found = map[originalUrl];
  return found && typeof found === "object" ? found : {};
}

// srcset для <source type="image/webp">: «url 400w, url 800w, …».
// Пустая строка — вариантов нет, вызывающий код не рисует <source> вовсе.
export function webpSrcSet(
  variants: Partial<Record<string, string>>
): string {
  return VARIANT_WIDTHS.map((w) => {
    const url = variants[String(w)];
    return url ? `${url} ${w}w` : null;
  })
    .filter(Boolean)
    .join(", ");
}

// Разбор значения из базы: PocketBase отдаёт json-поле как есть, и туда могло
// попасть что угодно (старая запись, ручная правка). Приводим к безопасной
// форме — иначе одна кривая запись роняла бы карточку товара.
export function parseVariantMap(raw: unknown): ImageVariantMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ImageVariantMap = {};
  for (const [original, variants] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!variants || typeof variants !== "object" || Array.isArray(variants))
      continue;
    const entry: Partial<Record<string, string>> = {};
    for (const width of VARIANT_WIDTHS) {
      const url = (variants as Record<string, unknown>)[String(width)];
      if (typeof url === "string" && url) entry[String(width)] = url;
    }
    if (Object.keys(entry).length > 0) out[original] = entry;
  }
  return out;
}
