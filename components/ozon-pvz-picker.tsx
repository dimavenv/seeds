"use client";

import { useEffect, useRef, useState } from "react";
import AddressSuggestInput from "@/components/address-suggest-input";
import type { OzonPvzPoint } from "@/lib/ozon-pvz";

export type OzonPvzSelection = { code: string; address: string };

const YMAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY;

// Ленивая загрузка Яндекс.Карт (один раз на страницу). Без ключа — не грузим,
// пикер работает как список.
let ymapsPromise: Promise<any> | null = null;
function loadYmaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  const w = window as any;
  if (w.ymaps && w.ymaps.Map) return Promise.resolve(w.ymaps);
  if (!YMAPS_KEY) return Promise.reject(new Error("no key"));
  if (ymapsPromise) return ymapsPromise;
  ymapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${YMAPS_KEY}&lang=ru_RU`;
    s.async = true;
    s.onload = () => w.ymaps.ready(() => resolve(w.ymaps));
    s.onerror = () => reject(new Error("script error"));
    document.head.appendChild(s);
  });
  return ymapsPromise;
}

export default function OzonPvzPicker({
  value,
  onChange,
}: {
  value: OzonPvzSelection | null;
  onChange: (v: OzonPvzSelection | null) => void;
}) {
  const [city, setCity] = useState("");
  const [points, setPoints] = useState<OzonPvzPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Загрузка точек по городу (с дебаунсом).
  useEffect(() => {
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/ozon/pvz?city=${encodeURIComponent(city)}`,
          { signal: ctrl.signal }
        );
        const data = (await res.json()) as { points: OzonPvzPoint[]; demo: boolean };
        setPoints(data.points ?? []);
        setDemo(Boolean(data.demo));
      } catch {
        /* отменённый/сетевой запрос */
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [city]);

  // Инициализация карты (если есть ключ Яндекса).
  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        mapRef.current = new ymaps.Map(mapEl.current, {
          center: [55.75, 37.62],
          zoom: 9,
          controls: ["zoomControl", "geolocationControl"],
        });
        clustererRef.current = new ymaps.Clusterer({ preset: "islands#greenClusterIcons" });
        mapRef.current.geoObjects.add(clustererRef.current);
        setMapReady(true);
      })
      .catch(() => setMapReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Перерисовка меток при изменении списка точек.
  useEffect(() => {
    const ymaps = (window as any).ymaps;
    if (!mapReady || !ymaps || !clustererRef.current || !mapRef.current) return;
    clustererRef.current.removeAll();
    const marks = points.map((p) => {
      const mark = new ymaps.Placemark(
        [p.lat, p.lon],
        {
          balloonContentHeader: p.name,
          balloonContentBody: `${p.address}${p.worktime ? `<br><small>${p.worktime}</small>` : ""}`,
          hintContent: p.address,
        },
        {
          preset:
            value?.code === p.code
              ? "islands#redDotIcon"
              : "islands#greenDotIcon",
        }
      );
      mark.events.add("click", () => onChange({ code: p.code, address: p.address }));
      return mark;
    });
    clustererRef.current.add(marks);
    if (points.length) {
      mapRef.current.setBounds(clustererRef.current.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 30,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, mapReady, value?.code]);

  const shown = query.trim()
    ? points.filter((p) =>
        p.address.toLowerCase().includes(query.trim().toLowerCase())
      )
    : points;

  return (
    <div className="space-y-3">
      {/* Город — с подсказками DaData */}
      <AddressSuggestInput
        label="Город"
        value={city}
        onChange={setCity}
        onPick={(s) => setCity(s.value)}
        fromBound="city"
        toBound="settlement"
        placeholder="Начните вводить город — Москва, Краснодар…"
      />

      <div className="grid gap-3 md:grid-cols-2">
        {/* Карта (если подключён Яндекс) */}
        {YMAPS_KEY ? (
          <div
            ref={mapEl}
            className="h-72 w-full overflow-hidden rounded-xl border border-brand-200 bg-brand-50 md:h-80"
          />
        ) : (
          <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-brand-200 bg-brand-50 p-4 text-center text-xs text-brand-400 md:h-80">
            Карта появится после подключения Яндекс.Карт. Пока выбирайте пункт из
            списка справа.
          </div>
        )}

        {/* Список пунктов с поиском */}
        <div className="flex h-72 flex-col rounded-xl border border-brand-200 md:h-80">
          <div className="border-b border-brand-100 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по адресу пункта"
              className="input !py-2 text-sm"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto p-1">
            {loading && (
              <li className="px-3 py-4 text-center text-sm text-brand-400">
                Загружаем пункты…
              </li>
            )}
            {!loading && shown.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-brand-400">
                {city.trim()
                  ? "В этом городе пунктов не нашлось."
                  : "Укажите город, чтобы увидеть пункты выдачи."}
              </li>
            )}
            {shown.map((p) => {
              const selected = value?.code === p.code;
              return (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => onChange({ code: p.code, address: p.address })}
                    className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                      selected
                        ? "bg-brand-600 text-white"
                        : "text-brand-700 hover:bg-brand-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {p.address}
                    </span>
                    <span
                      className={`block text-xs ${
                        selected ? "text-white/80" : "text-brand-500"
                      }`}
                    >
                      {p.name}
                      {p.worktime ? ` · ${p.worktime}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Выбранный пункт */}
      {value ? (
        <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600">
            <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.573l.062.03.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
          </svg>
          <span className="min-w-0 text-brand-700">
            Пункт выдачи выбран: <span className="font-semibold">{value.address}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto shrink-0 text-xs font-semibold text-accent-600 hover:underline"
          >
            Сбросить
          </button>
        </div>
      ) : (
        <p className="text-xs text-brand-500">
          Выберите пункт выдачи на карте или в списке — без выбора заказ оформить
          нельзя. Не нашли удобный? Смотрите все точки на{" "}
          <a
            href="https://www.ozon.ru/geo/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent-600 underline underline-offset-2"
          >
            карте пунктов выдачи Ozon
          </a>
          .
        </p>
      )}

      {demo && (
        <p className="text-[11px] text-brand-400">
          Показаны демонстрационные пункты. Реальные адреса Ozon появятся после
          подключения Ozon Rocket.
        </p>
      )}
    </div>
  );
}
