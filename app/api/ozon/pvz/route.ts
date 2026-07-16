import { NextResponse } from "next/server";
import { getOzonPvz } from "@/lib/ozon-pvz";

export const dynamic = "force-dynamic";

// Пункты выдачи Ozon для выбора на карте. Ключи Rocket живут на сервере и в
// браузер не попадают. Отдаём максимум 100 точек, чтобы не перегружать карту.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  try {
    const { points, demo } = await getOzonPvz(city, q);
    return NextResponse.json({ points: points.slice(0, 100), demo });
  } catch {
    return NextResponse.json({ points: [], demo: true }, { status: 200 });
  }
}
