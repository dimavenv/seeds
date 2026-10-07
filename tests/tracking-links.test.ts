import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  safeTarget,
  shouldCount,
  summarize,
  periodStart,
  type TrackingLink,
} from "@/lib/tracking-links";
import fs from "node:fs";
const mocks = vi.hoisted(() => ({
  getOne: vi.fn(),
  create: vi.fn(),
  admin: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/pb/server", () => ({ pbAdmin: mocks.admin }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET, HEAD } from "@/app/r/[id]/route";
import {
  createTrackingLink,
  toggleTrackingLink,
} from "@/app/admin/links/actions";
const id = "abcdefghijklmno";
const links: TrackingLink[] = [
  {
    id,
    title: "Посевная",
    platform: "Telegram",
    target: "/catalog",
    active: true,
    created: "2026-10-01",
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mocks.getOne.mockResolvedValue(links[0]);
  mocks.create.mockResolvedValue({ id });
  mocks.admin.mockResolvedValue({
    collection: () => ({ getOne: mocks.getOne, create: mocks.create }),
  });
  mocks.session.mockResolvedValue({ isAdmin: false });
});
describe("адреса и статистика ссылок", () => {
  it("сохраняет параметры и якорь своей страницы", () => {
    expect(
      safeTarget(
        "https://example.com/catalog?q=tomato#sort",
        "https://example.com",
      ),
    ).toBe("/catalog?q=tomato#sort");
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/r/abc",
    "/api/auth/logout",
    "/admin",
    "/%61dmin",
    "/%2f%2fevil.test",
    "/catalog/../r/test",
    "javascript:alert(1)",
  ])("не допускает опасный адрес %s", (target) => {
    expect(() => safeTarget(target, "https://example.com")).toThrow();
  });
  it("отсеивает предпросмотры и роботов", () => {
    expect(shouldCount(new Headers({ "user-agent": "TelegramBot" }))).toBe(
      false,
    );
    expect(
      shouldCount(new Headers({ "sec-purpose": "prefetch;prerender" })),
    ).toBe(false);
    expect(shouldCount(new Headers({ "user-agent": "Mozilla/5.0" }))).toBe(
      true,
    );
  });
  it("считает повторы, QR и уникальные браузеры, заполняет нулевые дни по Москве", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const event = {
      link: id,
      visitor: "same",
      channel: "link",
      created: "2026-10-06T22:00:00Z",
    };
    const r = summarize(
      links,
      [
        event,
        event,
        { ...event, channel: "qr", visitor: "" },
        { ...event, created: "2026-09-01" },
        { ...event, created: "2026-10-08" },
      ],
      7,
      now,
    );
    expect(r.total).toBe(3);
    expect(r.unique).toBe(1);
    expect(r.qr).toBe(1);
    expect(r.daily).toHaveLength(7);
    expect(r.daily[0].visits).toBe(0);
    expect(r.daily[6]).toEqual({ date: "2026-10-07", visits: 3, qr: 1 });
    expect(r.platforms).toEqual([{ name: "Telegram", visits: 3 }]);
    expect(periodStart(7, now).toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
});
describe("публичный переход", () => {
  const request = (headers?: Record<string, string>) =>
    new NextRequest(`https://example.com/r/${id}?via=qr`, { headers });
  it("пишет анонимный QR переход и отправляет на страницу без кеширования", async () => {
    const res = await GET(request(), { params: { id } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/catalog");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.cookies.get("tracking_visitor")).toBeUndefined();
    expect(mocks.create).toHaveBeenCalledWith({
      link: id,
      visitor: "",
      channel: "qr",
    });
  });
  it("повторно использует идентификатор только с согласием", async () => {
    const visitor = "8a7735ce-604f-4056-a3f8-15d6a41122ea";
    const res = await GET(
      request({ cookie: `tracking_consent=yes; tracking_visitor=${visitor}` }),
      { params: { id } },
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ visitor }),
    );
    expect(res.cookies.get("tracking_visitor")?.value).toBe(visitor);
  });
  it("HEAD и боты не увеличивают статистику", async () => {
    await HEAD(request(), { params: { id } });
    await GET(request({ "user-agent": "facebookexternalhit" }), {
      params: { id },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("отключённая ссылка не перенаправляет и не считается", async () => {
    mocks.getOne.mockResolvedValue({ ...links[0], active: false });
    expect((await GET(request(), { params: { id } })).status).toBe(410);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("ошибка записи аналитики не мешает переходу", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.create.mockRejectedValueOnce(new Error("offline"));
    expect((await GET(request(), { params: { id } })).status).toBe(302);
    log.mockRestore();
  });
  it("различает неизвестную ссылку и недоступность БД", async () => {
    mocks.getOne.mockRejectedValueOnce({ status: 404 });
    expect((await GET(request(), { params: { id } })).status).toBe(404);
    mocks.getOne.mockRejectedValueOnce({ status: 500 });
    expect((await GET(request(), { params: { id } })).status).toBe(503);
  });
});
describe("защита админки", () => {
  it("не позволяет гостю создавать и отключать ссылки", async () => {
    expect(await createTrackingLink(new FormData())).toEqual({
      error: "Доступ запрещён",
    });
    expect(await toggleTrackingLink(id, false)).toEqual({
      error: "Доступ запрещён",
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("разрешает администратору создать проверенную ссылку", async () => {
    mocks.session.mockResolvedValue({ isAdmin: true });
    const data = new FormData();
    data.set("title", "Telegram · осень");
    data.set("platform", "Telegram");
    data.set("target", "/catalog");
    expect(await createTrackingLink(data)).toEqual({ id });
    expect(mocks.create).toHaveBeenCalledWith({
      title: "Telegram · осень",
      platform: "Telegram",
      target: "/catalog",
      active: true,
    });
  });
  it("закрывает прямую запись и публичное чтение коллекций", () => {
    const schema = JSON.parse(
      fs.readFileSync("pocketbase/pb_schema.json", "utf8"),
    );
    for (const name of ["tracking_links", "tracking_visits"]) {
      const c = schema.find((r: { name: string }) => r.name === name);
      expect(c.listRule).toBe('@request.auth.role = "admin"');
      expect(c.viewRule).toBe('@request.auth.role = "admin"');
      for (const rule of ["createRule", "updateRule", "deleteRule"])
        expect(c[rule]).toBeNull();
    }
  });
});
