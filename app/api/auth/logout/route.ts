import { NextResponse } from "next/server";
import { PB_COOKIE } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Выход: гасим httpOnly-cookie сессии на сервере (из JS её не удалить). Клиент
// дополнительно чистит свой SDK-стор (localStorage) через clearAuth().
export async function POST(req: Request) {
  const secure = (req.headers.get("x-forwarded-proto") || "https") === "https";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PB_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
