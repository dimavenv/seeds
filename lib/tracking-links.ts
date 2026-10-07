export const PLATFORMS = [
  "Telegram",
  "ВКонтакте",
  "Instagram",
  "YouTube",
  "Дзен",
  "WhatsApp",
  "Печатная реклама",
  "Другое",
];
export type TrackingLink = {
  id: string;
  title: string;
  platform: string;
  target: string;
  active: boolean;
  created: string;
};
export type TrackingVisit = {
  link: string;
  visitor: string;
  channel: string;
  created: string;
};

// Только страницы этого сайта, без цепочек редиректов и служебных маршрутов.
export function safeTarget(raw: string, origin: string): string {
  const input = raw.trim() || "/";
  if (input.length > 1500 || /[\\\u0000-\u0020]/.test(input))
    throw new Error("Укажите корректный адрес страницы сайта");
  const base = new URL(origin);
  const url = new URL(input, base);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    throw new Error("Некорректный адрес");
  }
  if (
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    /[\\\u0000-\u0020]/.test(path) ||
    path.startsWith("//") ||
    /^\/(r|api|admin|pb|_next)(\/|$)/i.test(path)
  ) {
    throw new Error(
      "Выберите публичную страницу этого сайта, например /catalog",
    );
  }
  return url.pathname + url.search + url.hash;
}
export function shouldCount(headers: Headers): boolean {
  return (
    !/bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|headless/i.test(
      headers.get("user-agent") || "",
    ) &&
    !/prefetch|prerender/i.test(
      `${headers.get("purpose") || ""} ${headers.get("sec-purpose") || ""}`,
    ) &&
    !headers.has("next-router-prefetch")
  );
}
export function dayKey(value: string | Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function periodStart(days: number, now = new Date()): Date {
  return new Date(
    new Date(`${dayKey(now)}T00:00:00+03:00`).getTime() - (days - 1) * 86400000,
  );
}
export function summarize(
  links: TrackingLink[],
  visits: TrackingVisit[],
  days: number,
  now = new Date(),
) {
  const start = periodStart(days, now);
  const daily = Array.from({ length: days }, (_, i) => ({
    date: dayKey(new Date(start.getTime() + i * 86400000)),
    visits: 0,
    qr: 0,
  }));
  const byDay = new Map(daily.map((d) => [d.date, d]));
  const byLink = new Map(
    links.map((l) => [
      l.id,
      { ...l, visits: 0, qr: 0, visitors: new Set<string>() },
    ]),
  );
  const visitors = new Set<string>();
  let total = 0,
    qr = 0;
  for (const v of visits) {
    const time = new Date(v.created).getTime();
    if (
      !Number.isFinite(time) ||
      time < start.getTime() ||
      time > now.getTime()
    )
      continue;
    const row = byLink.get(v.link),
      day = byDay.get(dayKey(v.created));
    if (!row || !day) continue;
    row.visits++;
    day.visits++;
    total++;
    if (v.channel === "qr") {
      row.qr++;
      day.qr++;
      qr++;
    }
    if (v.visitor) {
      visitors.add(v.visitor);
      row.visitors.add(v.visitor);
    }
  }
  const platforms = new Map<string, number>();
  for (const row of byLink.values())
    platforms.set(
      row.platform,
      (platforms.get(row.platform) || 0) + row.visits,
    );
  return {
    total,
    qr,
    unique: visitors.size,
    daily,
    links: [...byLink.values()].map((r) => ({
      ...r,
      visitors: r.visitors.size,
    })),
    platforms: [...platforms]
      .map(([name, visits]) => ({ name, visits }))
      .filter((r) => r.visits > 0)
      .sort((a, b) => b.visits - a.visits),
  };
}
