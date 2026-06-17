import { NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const products = await getProductsByIds(ids);
  return NextResponse.json({ products });
}
