import { createClient } from "@/lib/supabase/server";
import ProductsTable from "@/components/admin/products-table";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select("id, slug, name, price, image_url, stock, is_new, is_featured")
    .order("created_at", { ascending: false });

  const products = (data ?? []) as Product[];

  return <ProductsTable products={products} />;
}
