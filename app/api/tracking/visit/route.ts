import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { pbAdmin } from "@/lib/pb/server";
import { csrfGuard } from "@/lib/csrf";
import { verifyTrackingEvent } from "@/lib/tracking-event";
import { siteUrl } from "@/lib/seo";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  const denied = csrfGuard(request);
  if (denied) return denied;
  let token: unknown;
  try { token = (await request.json())?.token; } catch {
    return NextResponse.json({ error: "Некорректное событие" }, { status: 400, headers });
  }
  if (typeof token !== "string" || token.length > 180)
    return NextResponse.json({ error: "Некорректное событие" }, { status: 400, headers });
  try {
    const event = verifyTrackingEvent(token);
    if (!event) return NextResponse.json({ error: "Событие истекло" }, { status: 400, headers });
    const pb = await pbAdmin();
    const link = await pb.collection("tracking_links").getOne(event.link);
    if (!link.active) return new NextResponse(null, { status: 204, headers });
    const consent = request.cookies.get("tracking_consent")?.value === "yes";
    const previous = request.cookies.get("tracking_visitor")?.value || "";
    const visitor = consent ? (/^[a-f0-9-]{36}$/.test(previous) ? previous : randomUUID()) : "";
    let recordedVisitor = visitor;
    try {
      // PRIMARY KEY в PocketBase атомарно отсекает дубли даже между воркерами.
      await pb.collection("tracking_visits").create({ ...event, visitor });
    } catch (error) {
      const saved = await pb.collection("tracking_visits").getOne(event.id).catch(() => null);
      if (!saved || saved.link !== event.link || saved.channel !== event.channel) throw error;
      recordedVisitor = saved.visitor || "";
    }
    const response = new NextResponse(null, { status: 204, headers });
    if (consent && recordedVisitor) response.cookies.set("tracking_visitor", recordedVisitor, {
      httpOnly: true, sameSite: "lax", secure: new URL(siteUrl()).protocol === "https:",
      path: "/", maxAge: 60 * 60 * 24 * 90,
    });
    return response;
  } catch {
    console.error("[tracking] Не удалось подтвердить переход");
    return NextResponse.json({ error: "Повторите позже" }, { status: 503, headers });
  }
}
