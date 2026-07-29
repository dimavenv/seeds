"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Собственный индикатор горизонтальной прокрутки для лент — меню в шапке,
// строки категорий.
//
// Зачем свой, если для полосы прокрутки есть CSS: на телефонах браузер рисует
// НАЛОЖЕННУЮ полосу — она появляется только во время движения и не поддаётся
// ::-webkit-scrollbar. То есть ровно там, где ленты и листают пальцем, красивую
// полосу средствами CSS сделать нельзя. Здесь же обычные два div'а: выглядят
// одинаково везде, видны всегда, а ползунок ещё и таскается мышью или пальцем.
//
// Ширина ползунка = доля видимой части ленты, положение = доля прокрутки.

// Меньше этого прокручивать нечего — индикатор не показываем, чтобы под лентой
// не висела бесполезная полоска во всю ширину.
const MIN_SCROLLABLE_PX = 24;
// Совсем короткий ползунок неудобно хватать, поэтому у него есть минимум.
const MIN_THUMB_PCT = 12;

export default function ScrollIndicator({
  targetRef,
  className = "bg-brand-200/50",
  thumbClassName = "bg-brand-400 hover:bg-brand-500 active:bg-brand-500",
}: {
  /** Ссылка на прокручиваемый элемент. */
  targetRef: React.RefObject<HTMLElement>;
  /** Оформление дорожки — переопределяется на цветной подложке. */
  className?: string;
  /** Оформление ползунка — там же. */
  thumbClassName?: string;
}) {
  // ratio === 0 означает «листать нечего», индикатор не рисуется.
  const [ratio, setRatio] = useState(0);
  const [progress, setProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max < MIN_SCROLLABLE_PX) {
      setRatio(0);
      return;
    }
    setRatio(el.clientWidth / el.scrollWidth);
    setProgress(el.scrollLeft / max);
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    // Ширина ленты меняется при повороте телефона и смене размера окна;
    // содержимое — когда подгрузились категории.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, targetRef]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    event.preventDefault();

    const startX = event.clientX;
    const startScroll = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    // Ползунок короче дорожки, поэтому его ход меньше её ширины: переводим
    // смещение курсора в прокрутку через реальный доступный ход.
    const travel = track.clientWidth * (1 - el.clientWidth / el.scrollWidth);
    if (travel <= 0) return;

    const onMove = (e: PointerEvent) => {
      el.scrollLeft = startScroll + ((e.clientX - startX) / travel) * max;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  if (ratio === 0) return null;

  const widthPct = Math.max(ratio * 100, MIN_THUMB_PCT);
  const leftPct = progress * (100 - widthPct);

  return (
    <div
      ref={trackRef}
      className={`relative h-1.5 w-full overflow-hidden rounded-full ${className}`}
      // Индикатор дублирует то, что и так видно по положению ленты, — для
      // скринридера это лишний шум.
      aria-hidden="true"
    >
      <div
        onPointerDown={startDrag}
        style={{ width: `${widthPct}%`, left: `${leftPct}%` }}
        className={`absolute inset-y-0 cursor-grab touch-none rounded-full transition-colors active:cursor-grabbing ${thumbClassName}`}
      />
    </div>
  );
}
