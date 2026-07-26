import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { cleanupStalePendingOrders } from "@/lib/order-cleanup";

export const dynamic = "force-dynamic";

// Плановая уборка зависших неоплаченных заказов (возврат резерва на склад).
// Вызывается по расписанию (systemd timer / crontab) — см. deploy/cleanup.timer.
// Защищён секретом CRON_SECRET: пока он не задан, роут выключен (404), чтобы
// снаружи нельзя было запускать уборку. Секрет передавайте заголовком
//   Authorization: Bearer <CRON_SECRET>
// (в URL как ?token=... — только как запасной вариант, попадает в логи).
function tokenOk(provided: string, secret: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && tokenOk(bearer, secret)) return true;
  const q = new URL(req.url).searchParams.get("token") || "";
  return Boolean(q) && tokenOk(q, secret);
}

async function run(req: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return new NextResponse("cron disabled", { status: 404 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return NextResponse.json({ error: "db not configured" }, { status: 503 });
  }
  try {
    const pb = await pbAdmin();
    const removed = await cleanupStalePendingOrders(pb);
    return NextResponse.json({ ok: true, removed });
  } catch {
    return NextResponse.json({ error: "cleanup failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}
