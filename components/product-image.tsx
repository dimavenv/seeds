import { webpSrcSet } from "@/lib/image-variants";

// Фото товара: WebP-варианты, если они сгенерированы, иначе — оригинал.
//
// Почему <picture>, а не next/image: оптимизатор Next намеренно выключен
// (images.unoptimized — пережимать на каждый запрос на одном VPS нечем), и в
// таком режиме next/image не делает ничего, кроме раскладки. А <picture> даёт
// ровно то, что нужно: браузер сам выбирает WebP нужной ширины, а при любом
// сомнении берёт <img> с оригиналом.
//
// Фолбэк здесь не «на всякий случай», а рабочий путь: у всех фото, загруженных
// до появления вариантов, их нет — и они продолжают показываться как раньше.
export default function ProductImage({
  src,
  alt,
  variants,
  sizes,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  /** Карта «ширина → адрес» для этого фото; пустая — покажем оригинал. */
  variants?: Partial<Record<string, string>>;
  sizes: string;
  className?: string;
  /** Для главного фото первого экрана: грузить сразу, оно определяет LCP. */
  priority?: boolean;
}) {
  const srcSet = webpSrcSet(variants ?? {});

  return (
    <picture>
      {srcSet && <source type="image/webp" srcSet={srcSet} sizes={sizes} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        // fetchPriority подсказывает браузеру, что это главная картинка экрана.
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
        className={className}
      />
    </picture>
  );
}
