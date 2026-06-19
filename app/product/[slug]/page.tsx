import Link from "next/link";
import { notFound } from "next/navigation";
import AddToCart from "@/components/add-to-cart";
import ProductGrid from "@/components/product-grid";
import ProductGallery from "@/components/product-gallery";
import { getProductBySlug, getProducts } from "@/lib/data";
import { formatPrice } from "@/lib/format";

export const revalidate = 60;

export default async function ProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await getProductBySlug(params.slug);
  if (!product) notFound();

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

  return (
    <div className="container-page py-6">
      <nav className="mb-4 text-sm text-brand-500">
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
        <ProductGallery images={galleryImages} alt={product.name} />

        <div>
          <div className="flex gap-2">
            {product.is_new && <span className="badge bg-brand-500 text-white">Новинка</span>}
            {product.is_featured && <span className="badge bg-accent-500 text-white">Хит</span>}
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-brand-900">
            {product.name}
          </h1>
          {product.category?.name && (
            <p className="mt-1 text-sm text-brand-500">{product.category.name}</p>
          )}
          <p className="mt-4 text-4xl font-extrabold text-brand-700">
            {formatPrice(product.price)}
          </p>
          {product.description && (
            <p className="mt-4 leading-relaxed text-brand-700">
              {product.description}
            </p>
          )}
          <div className="mt-6">
            <AddToCart product={product} />
          </div>
        </div>
      </div>

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
