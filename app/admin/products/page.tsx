import { createServerPb } from "@/lib/pb/server";
import { mapCategory, mapProduct } from "@/lib/pb/shared";
import ProductsTable from "@/components/admin/products-table";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const pb = createServerPb();
  let products: Product[] = [];
  let categories: Category[] = [];
  try {
    const [list, cats] = await Promise.all([
      pb.collection("products").getFullList({ sort: "-created" }),
      pb.collection("categories").getFullList({ sort: "sort_order" }),
    ]);
    products = list.map(mapProduct);
    categories = cats.map(mapCategory);
  } catch {
    products = [];
    categories = [];
  }

  return <ProductsTable products={products} categories={categories} />;
}
