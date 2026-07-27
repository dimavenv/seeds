import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import AddToCart from "@/components/add-to-cart";
import ProductGrid from "@/components/product-grid";
import ProductGallery from "@/components/product-gallery";
import JsonLd from "@/components/json-ld";
import {
  getProductByLegacyRef,
  getProductBySlug,
  getProducts,
} from "@/lib/data";
import { formatPrice, seedsLabel } from "@/lib/format";
import { descriptionParagraphs, truncateForMeta } from "@/lib/product-text";
import { ORGANIZATION_ID, SITE_NAME, absoluteUrl, siteUrl } from "@/lib/seo";
import type { Product } from "@/lib/types";

export const revalidate = 60;

// Товар для одного запроса читаем один раз: generateMetadata и сам компонент
// вызываются оба, а запросы к PocketBase идут с no-store и штатным fetch-кэшем
// Next не склеиваются. cache() из React дедуплицирует их в пределах запроса.
const loadProduct = cache((slug: string) => getProductBySlug(slug));

// Товара по слагу нет. Если ссылка пришла со старого адреса /product/<id> —
// уводим 301 на канонический адрес со слагом, чтобы не терять уже набранный
// вес страницы. Иначе возвращаем управление вызывающему коду.
//
// Вызывается и из generateMetadata, и из компонента: редирект должен
// сработать в обоих случаях, а cache() выше не даёт сходить в базу дважды.
async function redirectLegacyUrl(slug: string): Promise<void> {
  const legacy = await getProductByLegacyRef(slug);
  if (legacy?.slug) permanentRedirect(`/product/${legacy.slug}`);
}

// Заголовок карточки — главный сигнал релевантности для запроса «<сорт>
// семена купить»: название сорта идёт первым словом, дальше — коммерческие
// уточнения. Бренд в конце добавляет шаблон из app/layout.tsx.
function productTitle(product: Product): string {
  return `Семена ${product.name} — купить почтой`;
}

function productDescription(product: Product): string {
  const own = product.description?.trim();
  if (own) return truncateForMeta(own);
  // Пока уникального описания сорта нет (его пишет продавец, см. пункт 1.3
  // плана) — собираем осмысленный фолбэк из фактических полей карточки.
  // Дублировать один и тот же текст по всем товарам нельзя: одинаковые
  // description по сотне страниц поисковик считает шаблонными и игнорирует.
  const parts = [
    `Семена ${product.name}`,
    product.category?.name ? `категория «${product.category.name}»` : null,
    product.seeds_per_pack
      ? `в пакетике ${seedsLabel(product.seeds_per_pack)}`
      : null,
    `цена ${formatPrice(product.price)}`,
  ].filter(Boolean);
  return `${parts.join(", ")}. Доставка Ozon и Почтой России по всей стране.`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await loadProduct(params.slug);
  if (!product) {
    await redirectLegacyUrl(params.slug);
    // Товара нет и старой ссылки тоже — страница ответит 404-версткой, но со
    // статусом 200 (см. комментарий в компоненте ниже). Поэтому здесь важен
    // noindex: он не даёт несуществующему адресу попасть в индекс, даже пока
    // код ответа «мягкий».
    return {
      title: "Товар не найден",
      robots: { index: false, follow: false },
    };
  }

  const title = productTitle(product);
  const description = productDescription(product);
  const image = product.image_url ?? product.images?.[0];

  return {
    title,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: absoluteUrl(`/product/${product.slug}`),
      ...(image ? { images: [{ url: image, alt: `Семена ${product.name}` }] } : {}),
    },
  };
}

// Микроразметка карточки: цена, наличие и хлебные крошки. Из неё поисковик
// строит расширенный сниппет (цена и «в наличии» прямо в выдаче).
//
// aggregateRating здесь НЕТ намеренно: отзывы в магазине привязаны к магазину
// целиком, а не к конкретному сорту (коллекция reviews — без связи с
// products). Подставить в карточку сорта общий рейтинг магазина — это ровно
// тот случай, за который Google снимает расширенные сниппеты вручную. Рейтинг
// магазина размечен там, где ему место: на /reviews.
function productJsonLd(product: Product) {
  const url = absoluteUrl(`/product/${product.slug}`);
  const images = (
    product.images?.length ? product.images : [product.image_url]
  ).filter((u): u is string => Boolean(u));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: product.name,
        url,
        ...(images.length ? { image: images } : {}),
        ...(product.description
          ? { description: product.description.replace(/\s+/g, " ").trim() }
          : {}),
        sku: product.id,
        ...(product.category?.name ? { category: product.category.name } : {}),
        brand: { "@type": "Brand", name: SITE_NAME },
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "RUB",
          price: product.price,
          availability:
            product.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@id": ORGANIZATION_ID() },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { name: "Главная", item: siteUrl() },
          { name: "Каталог", item: absoluteUrl("/catalog") },
          ...(product.category
            ? [
                {
                  name: product.category.name,
                  item: absoluteUrl(`/catalog/${product.category.slug}`),
                },
              ]
            : []),
          { name: product.name, item: url },
        ].map((entry, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: entry.name,
          item: entry.item,
        })),
      },
    ],
  };
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await loadProduct(params.slug);
  if (!product) {
    await redirectLegacyUrl(params.slug);
    // ВНИМАНИЕ: здесь Next отдаёт вёрстку 404, но со статусом 200 — из-за
    // корневого app/loading.tsx ответ начинает стримиться раньше, чем
    // выполняется notFound(), и заголовки уже отправлены. Полноценный 404
    // вернётся, если убрать глобальный loading.tsx (тогда пропадёт индикатор
    // загрузки при переходах). От индексации мусорных адресов страхует
    // noindex из generateMetadata выше.
    notFound();
  }

  const related = (
    await getProducts({
      categorySlug: product.category?.slug,
      limit: 5,
    })
  )
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  // Список фото для галереи: массив images, иначе одиночное image_url.
  const galleryImages =
    product.images && product.images.length > 0
      ? product.images
      : product.image_url
      ? [product.image_url]
      : [];

  const paragraphs = descriptionParagraphs(product.description);

  return (
    <div className="container-page py-6">
      <JsonLd data={productJsonLd(product)} />
      <nav className="mb-4 text-sm text-brand-500" aria-label="Хлебные крошки">
        <Link href="/" className="hover:text-brand-700">Главная</Link>
        <span className="mx-1.5">/</span>
        <Link href="/catalog" className="hover:text-brand-700">Каталог</Link>
        {product.category && (
          <>
            <span className="mx-1.5">/</span>
            <Link
              href={`/catalog/${product.category.slug}`}
              className="hover:text-brand-700"
            >
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={galleryImages} alt={`Семена ${product.name}`} />

        <div>
          <div className="flex gap-2">
            {product.is_new && <span className="badge bg-brand-500 text-white">Новинка</span>}
            {product.is_featured && <span className="badge bg-accent-500 text-white">Хит</span>}
          </div>
          {/* Единственный h1 на странице — название сорта: именно его ищут
              запросом «<сорт> семена». */}
          <h1 className="mt-2 text-3xl font-extrabold text-brand-900">
            {product.name}
          </h1>
          {product.category?.name && (
            <p className="mt-1 text-sm text-brand-500">{product.category.name}</p>
          )}
          <p className="mt-4 text-4xl font-extrabold text-brand-700">
            {formatPrice(product.price)}
          </p>
          {product.seeds_per_pack ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
              🌱 В пакетике {seedsLabel(product.seeds_per_pack)}
            </p>
          ) : null}
          <div className="mt-6">
            <AddToCart product={product} />
          </div>
        </div>
      </div>

      {/* Описание сорта — в серверном HTML (страница целиком серверная):
          Яндекс индексирует такой текст сразу, не дожидаясь JS.
          TODO (пункт 1.3 плана): здесь ждётся УНИКАЛЬНЫЙ текст по каждому
          сорту — срок созревания, урожайность, вес и вкус плода, тип роста,
          устойчивость к болезням, советы по посадке. Поле описания в админке
          уже есть; переписанный с сайта поставщика текст не годится — именно
          из-за копий магазины семян и не ранжируются. */}
      {paragraphs.length > 0 && (
        <section className="mt-14 max-w-3xl">
          <h2 className="mb-4 text-xl font-bold text-brand-800">
            Описание сорта
          </h2>
          <div className="space-y-4 leading-relaxed text-brand-700">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold text-brand-800">
            Похожие товары
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
