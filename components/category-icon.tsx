import { getCategoryEmoji, getCategoryIcon } from "@/lib/categories";

// Значок категории: нарисованная иконка, а если её нет — эмодзи того же
// размера, чтобы строка чипов не «прыгала» по высоте.
//
// Обычный <img>, а не next/image: оптимизатор Next намеренно выключен
// (images.unoptimized), файлы и так по 3–5 КБ и лежат в public — обёртка не
// дала бы ничего, кроме лишней разметки.
export default function CategoryIcon({
  slug,
  className = "h-6 w-6",
}: {
  slug: string;
  /** Размер задаётся классами, по умолчанию 24×24. */
  className?: string;
}) {
  const src = getCategoryIcon(slug);

  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`${className} inline-flex shrink-0 items-center justify-center leading-none`}
      >
        {getCategoryEmoji(slug)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      // alt пустой: рядом всегда идёт название категории, и озвучивать его
      // скринридеру дважды не нужно.
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 object-contain`}
    />
  );
}
