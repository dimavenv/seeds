import { notFound } from "next/navigation";
import ProductForm from "@/components/admin/product-form";
import { createServerPb } from "@/lib/pb/server";
import { mapProduct } from "@/lib/pb/shared";
import { getCategories, isValidRecordId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isValidRecordId(params.id)) notFound();

  const pb = createServerPb();
  const [record, categories] = await Promise.all([
    pb.collection("products").getOne(params.id).catch(() => null),
    getCategories(),
  ]);

  if (!record) notFound();

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Редактирование товара
      </h2>
      <ProductForm product={mapProduct(record)} categories={categories} />
    </div>
  );
}
