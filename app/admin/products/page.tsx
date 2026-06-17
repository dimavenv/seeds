import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import DeleteProductButton from "@/components/admin/delete-product-button";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const supabase = createClient();
  const { data } = await supabase
    .from("products")
    .select("id, slug, name, price, image_url, stock, is_new, is_featured")
    .order("created_at", { ascending: false });

  const products = (data ?? []) as Product[];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-brand-800">
          Товары ({products.length})
        </h2>
        <Link href="/admin/products/new" className="btn-accent">
          + Добавить товар
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-brand-500">
            <tr>
              <th className="p-3">Фото</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Остаток</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-brand-100">
                <td className="p-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-brand-50">
                    {p.image_url && (
                      <Image src={p.image_url} alt="" fill sizes="48px" className="object-cover" />
                    )}
                  </div>
                </td>
                <td className="font-semibold text-brand-800">
                  {p.name}
                  {p.is_new && <span className="badge ml-2 bg-brand-500 text-white">new</span>}
                  {p.is_featured && <span className="badge ml-1 bg-accent-500 text-white">hit</span>}
                </td>
                <td>{formatPrice(p.price)}</td>
                <td>{p.stock}</td>
                <td className="space-x-3 whitespace-nowrap pr-3 text-right">
                  <Link href={`/admin/products/${p.id}`} className="text-sm font-semibold text-brand-600 hover:underline">
                    Изменить
                  </Link>
                  <DeleteProductButton id={p.id} />
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-brand-500">
                  Товаров пока нет. Добавьте первый.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
