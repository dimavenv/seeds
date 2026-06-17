import { notFound } from "next/navigation";
import ProductForm from "@/components/admin/product-form";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const [{ data }, categories] = await Promise.all([
    supabase.from("products").select("*").eq("id", Number(params.id)).maybeSingle(),
    getCategories(),
  ]);

  if (!data) notFound();

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Редактирование товара
      </h2>
      <ProductForm product={data as Product} categories={categories} />
    </div>
  );
}
