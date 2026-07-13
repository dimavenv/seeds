import { NextResponse } from "next/server";
import { isAlfaConfigured, alfaStatus } from "@/lib/alfa";

export const dynamic = "force-dynamic";

// Проверка статуса оплаты по alfaOrderId (не доверяем только редиректу с формы).
export async function POST(req: Request) {
  if (!isAlfaConfigured()) {
    return NextResponse.json({ orderStatus: null });
  }
  let body: { alfaOrderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const alfaOrderId = body.alfaOrderId?.trim();
  if (!alfaOrderId) return NextResponse.json({ orderStatus: null });

  try {
    const s = await alfaStatus(alfaOrderId);
    // orderStatus: 0 не оплачен,1 холд,2 оплачен,3 отменён,4 возврат,5 ACS,6 отклонён
    return NextResponse.json({ orderStatus: s.orderStatus ?? null });
  } catch {
    return NextResponse.json({ orderStatus: null });
  }
}
