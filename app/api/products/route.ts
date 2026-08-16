import { NextResponse } from "next/server";
import { existingProductIds, getProductsByIds, getProducts } from "@/lib/data";

// Разбор списка id из строки запроса (?ids=a,b,c).
function parseIds(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Проверка «эти товары ещё есть?» — по ней браузер вычищает корзину и
  // избранное от товаров, удалённых из каталога. Отдаём только id: тянуть
  // карточки целиком ради проверки незачем. 503, если проверить не удалось —
  // тогда клиент ничего не трогает (пустой ответ он бы принял за «всё удалили»).
  const exists = searchParams.get("exists");
  if (exists !== null) {
    const ids = await existingProductIds(parseIds(exists));
    if (ids === null) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ids });
  }

  // Живой поиск: ?q=... — вернуть подходящие товары для подсказок.
  const q = searchParams.get("q");
  if (q !== null) {
    const query = q.trim();
    if (query.length < 2) return NextResponse.json({ products: [] });
    const products = await getProducts({ q: query, limit: 6, sort: "name" });
    return NextResponse.json({ products });
  }

  const products = await getProductsByIds(parseIds(searchParams.get("ids")));
  return NextResponse.json({ products });
}
