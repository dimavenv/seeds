import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/pb/server", () => ({ pbAdmin: mocks.admin }));
import { createTrackingEvent, verifyTrackingEvent } from "@/lib/tracking-event";
import { POST } from "@/app/api/tracking/visit/route";

const link = "abcdefghijklmno";
const events = new Map<string, { id: string; link: string; channel: string; visitor: string }>();
const request = (token: string, cookie = "", origin = "https://example.com") => new NextRequest("https://example.com/api/tracking/visit", {
  method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ token }),
});
beforeEach(() => {
  vi.stubEnv("DATA_ENCRYPTION_KEY", "test-only-arrival-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  events.clear();
  mocks.admin.mockResolvedValue({ collection: (name: string) => ({
    getOne: async (id: string) => {
      if (name === "tracking_links") return { id, active: true };
      if (!events.has(id)) throw new Error("not found");
      return events.get(id);
    },
    create: async (event: { id: string; link: string; channel: string; visitor: string }) => {
      if (events.has(event.id)) throw new Error("duplicate primary key");
      events.set(event.id, event);
      return event;
    },
  }) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("подтверждение перехода", () => {
  it("параллельные и последовательные повторы дают одну анонимную запись", async () => {
    const token = createTrackingEvent(link, "qr");
    const results = await Promise.all([POST(request(token)), POST(request(token))]);
    expect(results.map(r => r.status)).toEqual([204, 204]);
    expect((await POST(request(token))).status).toBe(204);
    expect(events.size).toBe(1);
    expect([...events.values()][0]).toMatchObject({ link, channel: "qr", visitor: "" });
    expect(results[0].cookies.get("tracking_visitor")).toBeUndefined();
  });
  it("самостоятельные переходы и разные каналы не склеиваются", async () => {
    await POST(request(createTrackingEvent(link, "qr")));
    await POST(request(createTrackingEvent(link, "link")));
    await POST(request(createTrackingEvent(link, "qr")));
    expect(events.size).toBe(3);
  });
  it("сохраняет браузер только с согласием", async () => {
    const visitor = "8a7735ce-604f-4056-a3f8-15d6a41122ea";
    const res = await POST(request(createTrackingEvent(link, "link"), `tracking_consent=yes; tracking_visitor=${visitor}`));
    expect([...events.values()][0].visitor).toBe(visitor);
    expect(res.cookies.get("tracking_visitor")?.value).toBe(visitor);
  });
  it("отклоняет подделку канала, просроченные токены и запросы с чужого сайта", async () => {
    const token = createTrackingEvent(link, "qr");
    expect(verifyTrackingEvent(token.replace(".qr.", ".link."))).toBeNull();
    expect((await POST(request(token, "", "https://evil.test"))).status).toBe(403);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 301000);
    expect((await POST(request(token))).status).toBe(400);
    expect(events.size).toBe(0);
  });
  it("при недоступной базе позволяет повторить то же событие", async () => {
    const token = createTrackingEvent(link, "qr");
    mocks.admin.mockRejectedValueOnce(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(token))).status).toBe(503);
    expect((await POST(request(token))).status).toBe(204);
    expect(events.size).toBe(1);
    log.mockRestore();
  });
});
