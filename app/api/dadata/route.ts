import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { allowAttempt } from "@/lib/email-code";
import { fetchAddressSuggestions, hasServerDadata } from "@/lib/dadata-server";

export const dynamic = "force-dynamic";

// Прокси подсказок адреса DaData. Держит токен на сервере (аудит 5.5) и
// троттлит запросы per-IP, чтобы боты не жгли квоту. Входные параметры
// нормализуем и ограничиваем (длина запроса, число подсказок, размер locations).
export async function POST(req: Request) {
  if (!hasServerDadata()) return NextResponse.json({ suggestions: [] });

  let body: {
    query?: unknown;
    count?: unknown;
    fromBound?: unknown;
    toBound?: unknown;
    locations?: unknown;
    restrictValue?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ suggestions: [] });
  }

  const query = typeof body.query === "string" ? body.query.slice(0, 200) : "";
  if (query.trim().length < 2) return NextResponse.json({ suggestions: [] });

  const ip = clientIp(req);
  // До 60 запросов в минуту с IP — подсказки идут по мере ввода, но перебор
  // квоты этим не устроить.
  if (!allowAttempt(`dadata:${ip ?? "?"}`, 60, 60 * 1000)) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }

  const count = Math.min(20, Math.max(1, Math.floor(Number(body.count)) || 7));
  const fromBound = typeof body.fromBound === "string" ? body.fromBound : undefined;
  const toBound = typeof body.toBound === "string" ? body.toBound : undefined;
  const restrictValue =
    typeof body.restrictValue === "boolean" ? body.restrictValue : undefined;
  const locations = Array.isArray(body.locations)
    ? (body.locations.slice(0, 10) as object[])
    : undefined;

  const suggestions = await fetchAddressSuggestions({
    query,
    count,
    fromBound,
    toBound,
    locations,
    restrictValue,
  });
  return NextResponse.json({ suggestions });
}
