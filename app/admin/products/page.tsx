import { createServerPb } from "@/lib/pb/server";
import { mapProduct } from "@/lib/pb/shared";
import ProductsTable from "@/components/admin/products-table";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const pb = createServerPb();
  let products: Product[] = [];
  try {
    const list = await pb
      .collection("products")
      .getFullList({ sort: "-created" });
    products = list.map(mapProduct);
  } catch {
    products = [];
  }

  return <ProductsTable products={products} />;
}
