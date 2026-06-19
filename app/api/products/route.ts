import { NextResponse } from "next/server";
import { getProductsByIds, getProducts } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Живой поиск: ?q=... — вернуть подходящие товары для подсказок.
  const q = searchParams.get("q");
  if (q !== null) {
    const query = q.trim();
    if (query.length < 2) return NextResponse.json({ products: [] });
    const products = await getProducts({ q: query, limit: 6, sort: "name" });
    return NextResponse.json({ products });
  }

  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const products = await getProductsByIds(ids);
  return NextResponse.json({ products });
}
