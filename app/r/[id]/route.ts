import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { pbAdmin } from "@/lib/pb/server";
import { siteUrl } from "@/lib/seo";
import { safeTarget, shouldCount } from "@/lib/tracking-links";

export const dynamic = "force-dynamic";
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
async function resolve(request: NextRequest, id: string, count: boolean) {
  if (!/^[a-z0-9]{15}$/.test(id))
    return new NextResponse("Ссылка не найдена", {
      status: 404,
      headers: responseHeaders,
    });
  try {
    const pb = await pbAdmin();
    const link = await pb.collection("tracking_links").getOne(id);
    if (!link.active)
      return new NextResponse("Эта ссылка отключена", {
        status: 410,
        headers: responseHeaders,
      });
    const destination = new URL(safeTarget(link.target, siteUrl()), siteUrl());
    const response = NextResponse.redirect(destination, {
      status: 302,
      headers: responseHeaders,
    });
    if (count && shouldCount(request.headers)) {
      // Без согласия считаем только анонимный переход, без IP и идентификатора браузера.
      const consent = request.cookies.get("tracking_consent")?.value === "yes";
      const previous = request.cookies.get("tracking_visitor")?.value || "";
      const visitor = consent
        ? /^[a-f0-9-]{36}$/.test(previous)
          ? previous
          : randomUUID()
        : "";
      try {
        await pb
          .collection("tracking_visits")
          .create({
            link: id,
            visitor,
            channel:
              request.nextUrl.searchParams.get("via") === "qr" ? "qr" : "link",
          });
        if (consent)
          response.cookies.set("tracking_visitor", visitor, {
            httpOnly: true,
            sameSite: "lax",
            secure: destination.protocol === "https:",
            path: "/",
            maxAge: 60 * 60 * 24 * 90,
          });
      } catch {
        console.error("[tracking] Не удалось записать переход");
      }
    }
    return response;
  } catch (e) {
    const status = (e as { status?: number }).status === 404 ? 404 : 503;
    return new NextResponse(
      status === 404
        ? "Ссылка не найдена"
        : "Ссылка временно недоступна. Попробуйте позже.",
      { status, headers: responseHeaders },
    );
  }
}
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return resolve(request, params.id, true);
}
export async function HEAD(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return resolve(request, params.id, false);
}
