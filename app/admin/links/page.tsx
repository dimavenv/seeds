import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";
import { siteUrl } from "@/lib/seo";
import {
  periodStart,
  summarize,
  type TrackingLink,
  type TrackingVisit,
} from "@/lib/tracking-links";
import TrackingLinks from "@/components/admin/tracking-links";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ссылки и QR" };
export default async function LinksPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  if (!(await getSession()).isAdmin) return null;
  const days = [7, 30, 90].includes(Number(searchParams.days))
    ? Number(searchParams.days)
    : 30;
  const now = new Date();
  const origin = new URL(siteUrl()).origin;
  try {
    const pb = await pbAdmin();
    const [records, events] = await Promise.all([
      pb.collection("tracking_links").getFullList({ sort: "-created" }),
      pb
        .collection("tracking_visits")
        .getFullList({
          filter: pb.filter("created >= {:start} && created <= {:end}", {
            start: periodStart(days, now).toISOString(),
            end: now.toISOString(),
          }),
          fields: "link,visitor,channel,created",
        }),
    ]);
    const links: TrackingLink[] = records.map((r) => ({
      id: r.id,
      title: r.title,
      platform: r.platform,
      target: r.target,
      active: r.active,
      created: r.created,
    }));
    const visits: TrackingVisit[] = events.map((r) => ({
      link: r.link,
      visitor: r.visitor,
      channel: r.channel,
      created: r.created,
    }));
    const report = summarize(links, visits, days, now);
    const qrLinks = await Promise.all(
      report.links.map(async (l) => {
        const url = `${origin}/r/${l.id}?via=qr`;
        const options = {
          errorCorrectionLevel: "M" as const,
          margin: 4,
          width: 768,
          color: { dark: "#163c2fff", light: "#ffffffff" },
        };
        const [qrImage, svg] = await Promise.all([
          QRCode.toDataURL(url, options),
          QRCode.toString(url, { ...options, type: "svg" }),
        ]);
        return {
          ...l,
          qrImage,
          qrSvg: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        };
      }),
    );
    return (
      <TrackingLinks
        report={report}
        links={qrLinks}
        origin={origin}
        days={days}
      />
    );
  } catch {
    return (
      <div className="card p-8">
        <h2 className="text-xl font-bold text-brand-800">
          Не удалось загрузить ссылки
        </h2>
        <p className="mt-3 text-brand-600">
          Проверьте подключение к PocketBase и примените актуальную схему базы
          командой <code>npm run db:schema</code>. Затем обновите страницу.
        </p>
        <a className="btn-outline mt-5" href="/admin/links">
          Повторить
        </a>
      </div>
    );
  }
}
