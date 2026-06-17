import ProductForm from "@/components/admin/product-form";
import { getCategories } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await getCategories();
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">Новый товар</h2>
      <ProductForm categories={categories} />
    </div>
  );
}
