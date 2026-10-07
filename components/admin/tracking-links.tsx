"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTrackingLink,
  toggleTrackingLink,
} from "@/app/admin/links/actions";
import { PLATFORMS, type summarize } from "@/lib/tracking-links";
import BreakdownBars from "@/components/admin/breakdown-bars";

type Report = ReturnType<typeof summarize>;
type LinkRow = Report["links"][number] & { qrImage: string; qrSvg: string };
const nf = new Intl.NumberFormat("ru-RU");

export default function TrackingLinks({
  report,
  links,
  origin,
  days,
}: {
  report: Report;
  links: LinkRow[];
  origin: string;
  days: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  function runAction(task: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    void task().finally(() => setPending(false));
  }
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(links[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("");
  const current = links.find((l) => l.id === selected);
  const filtered = links.filter(
    (l) =>
      (!platform || l.platform === platform) &&
      `${l.title} ${l.platform}`.toLowerCase().includes(query.toLowerCase()),
  );
  const max = Math.max(1, ...report.daily.map((d) => d.visits));
  const total = report.total;
  const qrShare = total ? Math.round((report.qr / total) * 100) : 0;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Ссылка скопирована");
    } catch {
      setMessage(
        "Не удалось скопировать автоматически. Выделите адрес ссылки и скопируйте вручную.",
      );
    }
  }
  return (
    <div className="space-y-5">
      <section
        className="card overflow-hidden p-6 sm:p-8"
        style={{
          background:
            "linear-gradient(120deg, rgb(var(--brand-100)), rgb(var(--surface)))",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-500">
              Источники аудитории
            </p>
            <h2 className="mt-2 text-3xl font-bold text-brand-900">
              Каждая ссылка — своя история
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-brand-600">
              Создавайте ссылки для соцсетей и QR-коды для печати. Смотрите,
              какие площадки приводят посетителей на сайт.
            </p>
          </div>
          <button className="btn-outline" onClick={() => router.refresh()}>
            Обновить статистику ↻
          </button>
        </div>
        <div
          className="mt-6 flex flex-wrap gap-2"
          aria-label="Период статистики"
        >
          {[7, 30, 90].map((n) => (
            <a
              key={n}
              href={`?days=${n}`}
              aria-current={days === n ? "page" : undefined}
              className={days === n ? "btn-primary !py-2" : "btn-outline !py-2"}
            >
              {n} дней
            </a>
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Все переходы", nf.format(total), "За выбранный период"],
          [
            "Браузеры с согласием",
            nf.format(report.unique),
            "Уникальные среди разрешивших cookies",
          ],
          [
            "Переходы по QR",
            nf.format(report.qr),
            `${qrShare}% всех переходов`,
          ],
          [
            "Активные ссылки",
            nf.format(links.filter((l) => l.active).length),
            `Всего создано: ${links.length}`,
          ],
        ].map(([label, value, hint]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-brand-500">{label}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums text-brand-900">
              {value}
            </p>
            <p className="mt-2 text-xs text-brand-500">{hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex justify-between gap-3">
            <h3 className="font-bold text-brand-800">Динамика переходов</h3>
            <span className="text-xs text-brand-500">По дням · Москва</span>
          </div>
          {total === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center text-center">
              <p className="font-semibold text-brand-700">
                Здесь появится история переходов
              </p>
              <p className="mt-2 text-sm text-brand-500">
                Поделитесь первой ссылкой или разместите QR-код.
              </p>
            </div>
          ) : (
            <>
              <div
                className="relative mt-7 flex h-48 items-end gap-1 border-b border-brand-200"
                role="img"
                aria-label="Переходы по дням. Точные значения доступны в таблице ниже."
              >
                <span className="pointer-events-none absolute -top-5 left-0 text-xs text-brand-500">{max} переходов / день</span>
                <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-brand-100" aria-hidden="true" />
                {report.daily.map((d) => (
                  <div
                    key={d.date}
                    className="group relative flex h-full min-w-0 flex-1 items-end"
                    tabIndex={0}
                    aria-label={`${d.date}: ${d.visits} переходов, QR: ${d.qr}`}
                  >
                    <div
                      className="w-full overflow-hidden rounded-t-sm bg-brand-500 transition-colors group-hover:bg-brand-700"
                      style={{ height: `${(d.visits / max) * 100}%` }}
                    >
                      <div
                        className="w-full bg-amber-400"
                        style={{
                          height: `${d.visits ? (d.qr / d.visits) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-900 px-3 py-2 text-xs text-white group-hover:block group-focus:block">
                      {d.date.slice(5).split("-").reverse().join(".")} ·{" "}
                      {d.visits} / QR {d.qr}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-brand-500">
                <span>{report.daily[0].date}</span>
                <span>{report.daily.at(-1)?.date}</span>
              </div>
            </>
          )}
          <div className="mt-4 flex gap-5 text-xs text-brand-600">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" />
              Обычные ссылки
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
              QR-коды
            </span>
          </div>
          <details className="mt-4 text-sm text-brand-600">
            <summary className="cursor-pointer">
              Точные значения по дням
            </summary>
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Переходы по дням</caption>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Всего</th>
                    <th>QR</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.date} className="border-t border-brand-100">
                      <td className="py-2">{d.date}</td>
                      <td>{d.visits}</td>
                      <td>{d.qr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <div className="space-y-5">
          <BreakdownBars
            title="Переходы по платформам"
            rows={report.platforms}
            empty="Платформы появятся после первых переходов"
          />
          <section className="card flex items-center gap-5 p-5">
            <div
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
              style={{
                background: total
                  ? `conic-gradient(#fbbf24 0% ${qrShare}%, rgb(var(--brand-500)) ${qrShare}% 100%)`
                  : "rgb(var(--brand-100))",
              }}
              role="img"
              aria-label={`Доля QR: ${qrShare}%`}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white font-bold text-gray-900">
                {qrShare}%
              </span>
            </div>
            <div>
              <h3 className="font-bold text-brand-800">Доля QR-кодов</h3>
              <p className="mt-1 text-sm text-brand-500">
                {nf.format(report.qr)} из {nf.format(total)} переходов
              </p>
            </div>
          </section>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <h3 className="text-lg font-bold text-brand-800">Новая ссылка</h3>
          <p className="mt-1 text-sm text-brand-500">
            Одна ссылка на каждое размещение.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              runAction(async () => {
                try {
                  const result = await createTrackingLink(data);
                  if (result.error) setMessage(result.error);
                  else {
                    form.reset();
                    setSelected(result.id!);
                    setMessage("Ссылка создана. QR-код готов к скачиванию.");
                    router.refresh();
                  }
                } catch {
                  setMessage(
                    "Не удалось связаться с сервером. Повторите попытку.",
                  );
                }
              });
            }}
          >
            <label className="block text-sm font-medium text-brand-700">
              Название
              <input
                className="input mt-1 w-full"
                name="title"
                required
                maxLength={100}
                placeholder="Например, Telegram · октябрь"
              />
            </label>
            <label className="block text-sm font-medium text-brand-700">
              Платформа
              <input
                className="input mt-1 w-full"
                name="platform"
                list="tracking-platforms"
                required
                maxLength={60}
                placeholder="Выберите или введите свою"
              />
              <datalist id="tracking-platforms">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm font-medium text-brand-700">
              Куда вести посетителя
              <input
                className="input mt-1 w-full"
                name="target"
                maxLength={1500}
                defaultValue="/"
                required
                placeholder="/catalog"
              />
            </label>
            <p className="text-xs text-brand-500">
              Путь или полный адрес страницы вашего сайта.
            </p>
            <button className="btn-primary w-full" disabled={pending}>
              {pending ? "Сохраняем…" : "+ Создать ссылку и QR"}
            </button>
          </form>
        </section>
        <section className="card min-w-0 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-brand-800">
              Ваши ссылки <span className="text-brand-400">{links.length}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                className="input w-44"
                aria-label="Поиск ссылок"
                placeholder="Найти ссылку…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="input"
                aria-label="Фильтр списка по платформе"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="">Все платформы</option>
                {[...new Set(links.map((l) => l.platform))].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-brand-500">
            Счётчики за {days} дней. Поиск и фильтр применяются к списку ссылок.
          </p>
          <div className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-brand-500">
                {links.length
                  ? "Ничего не найдено"
                  : "Создайте первую ссылку — она появится здесь"}
              </p>
            ) : (
              filtered.map((l) => (
                <article
                  key={l.id}
                  className={`rounded-xl border p-4 ${selected === l.id ? "border-brand-400 bg-brand-50" : "border-brand-100"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="break-words font-semibold text-brand-800">
                        {l.title}
                      </h4>
                      <p className="mt-1 text-xs text-brand-500">
                        {l.platform} · {l.active ? "Активна" : "Отключена"}
                      </p>
                    </div>
                    <div className="text-right">
                      <b className="text-xl tabular-nums text-brand-800">
                        {nf.format(l.visits)}
                      </b>
                      <p className="text-xs text-brand-500">
                        переходов · QR {l.qr}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 select-all break-all rounded-lg bg-brand-100 px-3 py-2 font-mono text-xs text-brand-700">
                    {origin}/r/{l.id}
                  </p>
                  <p
                    className="mt-2 truncate text-xs text-brand-500"
                    title={l.target}
                  >
                    Ведёт на: {l.target}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-outline !px-3 !py-1.5 text-xs"
                      onClick={() => copy(`${origin}/r/${l.id}`)}
                    >
                      Копировать
                    </button>
                    <a
                      href="#tracking-qr"
                      className="btn-outline !px-3 !py-1.5 text-xs"
                      onClick={() => setSelected(l.id)}
                    >
                      QR-код ↓
                    </a>
                    <button
                      className="btn-outline !px-3 !py-1.5 text-xs"
                      disabled={pending}
                      onClick={() =>
                        runAction(async () => {
                          try {
                            const result = await toggleTrackingLink(
                              l.id,
                              !l.active,
                            );
                            setMessage(
                              result.error ||
                                (l.active
                                  ? "Ссылка отключена. Статистика сохранена."
                                  : "Ссылка включена"),
                            );
                            router.refresh();
                          } catch {
                            setMessage("Не удалось связаться с сервером");
                          }
                        })
                      }
                    >
                      {l.active ? "Отключить" : "Включить"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
      {current && (
        <section
          id="tracking-qr"
          className="scroll-mt-6 card flex flex-col items-center gap-6 p-6 sm:flex-row"
          aria-label={`QR-код: ${current.title}`}
        >
          {/* QR должен сохранять белую подложку и контраст в обеих темах. */}
          <img
            src={current.qrImage}
            alt={`QR-код ссылки «${current.title}»`}
            width={180}
            height={180}
            className="rounded-2xl border border-brand-100 bg-white p-2"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-500">
              Готов к размещению
            </p>
            <h3 className="mt-2 break-words text-xl font-bold text-brand-800">
              {current.title}
            </h3>
            <p className="mt-2 text-sm text-brand-600">
              Разместите код на упаковке, визитке или плакате. Переходы по нему
              будут отмечены как QR.
            </p>
            {!current.active && (
              <p className="mt-2 text-sm text-amber-700">
                Ссылка отключена. Включите её перед размещением QR-кода.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="btn-primary"
                href={current.qrImage}
                download={`qr-${current.id}.png`}
              >
                Скачать PNG
              </a>
              <a
                className="btn-outline"
                href={current.qrSvg}
                download={`qr-${current.id}.svg`}
              >
                SVG для печати
              </a>
              <button
                className="btn-outline"
                onClick={() => copy(`${origin}/r/${current.id}?via=qr`)}
              >
                Копировать QR-ссылку
              </button>
            </div>
          </div>
        </section>
      )}
      <p
        role="status"
        aria-live="polite"
        className={
          message
            ? "sticky bottom-4 z-20 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800 shadow-lg"
            : "sr-only"
        }
      >
        {message}
      </p>
      <p className="text-xs leading-relaxed text-brand-500">
        Платформа определяется созданной ссылкой, даже если её переслали в
        другое место. Переходы — открытия ссылок, включая повторные, а не точное
        число людей. Уникальные браузеры учитываются только после согласия на
        cookies; разные устройства считаются отдельно. Известные боты,
        предпросмотры и предварительная загрузка исключаются. QR определяется
        отметкой в адресе.
      </p>
    </div>
  );
}
