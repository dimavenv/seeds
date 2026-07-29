"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Собственная полоса прокрутки страницы — справа, поверх содержимого.
//
// Зачем не CSS. ::-webkit-scrollbar работает не везде: на телефонах и на macOS
// браузер рисует НАЛОЖЕННУЮ полосу, которая появляется только во время
// движения и правилам не подчиняется, а Firefox из стандартных свойств умеет
// лишь ширину и два цвета — ни скруглений, ни своего поведения. Свой элемент
// выглядит одинаково везде.
//
// Прокрутку страницы это не меняет: колесо, клавиши, пробел, поиск по странице
// работают как обычно, полоса только отражает положение и позволяет тянуть.

// Пока прокручивать почти нечего, полосу не показываем.
const MIN_SCROLLABLE_PX = 80;
// Ползунок короче этого неудобно хватать.
const MIN_THUMB_PX = 48;

export default function PageScrollbar() {
  const [metrics, setMetrics] = useState<{
    thumbHeight: number;
    thumbTop: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    const doc = document.documentElement;
    const viewport = window.innerHeight;
    const total = doc.scrollHeight;
    const max = total - viewport;
    if (max < MIN_SCROLLABLE_PX) {
      setMetrics(null);
      return;
    }
    const track = trackRef.current?.clientHeight ?? viewport;
    const thumbHeight = Math.max((viewport / total) * track, MIN_THUMB_PX);
    const progress = Math.min(1, Math.max(0, window.scrollY / max));
    setMetrics({
      thumbHeight,
      thumbTop: progress * (track - thumbHeight),
    });
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    // Высота страницы меняется без прокрутки и ресайза: подгрузились товары,
    // раскрылся ответ в «Частых вопросах», появилась плашка об отпуске.
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      ro.disconnect();
    };
  }, [sync]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !metrics) return;
    event.preventDefault();
    setDragging(true);

    const startY = event.clientY;
    const startScroll = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    // Ход ползунка короче дорожки на его собственную высоту — пересчитываем
    // смещение курсора именно через этот ход, иначе страница «убегает».
    const travel = track.clientHeight - metrics.thumbHeight;
    if (travel <= 0) return;

    const onMove = (e: PointerEvent) => {
      window.scrollTo({ top: startScroll + ((e.clientY - startY) / travel) * max });
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // Клик по пустой части дорожки — переход к этому месту страницы.
  function jumpTo(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !metrics) return;
    const rect = track.getBoundingClientRect();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const travel = track.clientHeight - metrics.thumbHeight;
    if (travel <= 0) return;
    const target = event.clientY - rect.top - metrics.thumbHeight / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: (Math.min(travel, Math.max(0, target)) / travel) * max,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  if (!metrics) return null;

  return (
    <div
      ref={trackRef}
      onPointerDown={jumpTo}
      // Поверх всего, но ниже модалок; на телефоне не показываем — там полосу
      // заменяет инерционная прокрутка, а узкая полоска у края мешала бы
      // жесту «назад» от края экрана.
      className="fixed right-1 top-2 bottom-2 z-40 hidden w-2.5 rounded-full sm:block"
      aria-hidden="true"
    >
      <div
        onPointerDown={startDrag}
        style={{ height: metrics.thumbHeight, transform: `translateY(${metrics.thumbTop}px)` }}
        className={`w-full cursor-grab touch-none rounded-full transition-colors ${
          dragging
            ? "cursor-grabbing bg-brand-600"
            : "bg-brand-400/70 hover:bg-brand-500"
        }`}
      />
    </div>
  );
}
