"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProductImage from "@/components/product-image";
import { ChevronIcon, CloseIcon, ZoomIcon } from "@/components/icons";
import { variantsFor, type ImageVariantMap } from "@/lib/image-variants";

// Просмотр фото товара во весь экран: крупная картинка, приближение колесом,
// щипком, двойным нажатием и кнопками, перетаскивание, переключение кадров.
//
// Показываем ДВА изображения друг над другом. Снизу — облегчённый вариант,
// который браузер уже скачал для страницы: он появляется мгновенно, без пустого
// чёрного экрана. Сверху — оригинал в полном разрешении, он проявляется, когда
// догрузится. Приближать имеет смысл именно его: у вариантов ширина 400/800/
// 1200px, и при увеличении они мылят. До открытия просмотра оригинал не
// запрашивается — страница товара по-прежнему грузит только лёгкий вариант.

const MIN_SCALE = 1;
const MAX_SCALE = 5;
// Во сколько раз приближают кнопка «+» и двойное нажатие.
const STEP = 1.6;
// Чувствительность колеса мыши. Меньше — плавнее.
const WHEEL_SENSITIVITY = 0.0015;

type Point = { x: number; y: number };
type View = { scale: number; offset: Point };

const START: View = { scale: 1, offset: { x: 0, y: 0 } };

type LightboxProps = {
  images: string[];
  alt: string;
  variants?: ImageVariantMap;
  /** Какой кадр показан. */
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
};

// Обёртка: заводит портал в body, потому что просмотр перекрывает всю страницу
// и любой родитель с overflow или transform обрезал бы его. На сервере document
// нет, поэтому до монтирования не рисуем ничего.
//
// Вся начинка вынесена в отдельный компонент намеренно: её эффекты должны
// выполняться, когда узлы уже в документе. Будь они здесь, первый прогон
// пришёлся бы на рендер с mounted === false, когда ни сцены, ни кнопок ещё
// нет, — так уже терялись и перевод фокуса, и подписка на колесо мыши.
export default function ImageLightbox(props: LightboxProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<LightboxDialog {...props} />, document.body);
}

function LightboxDialog({
  images,
  alt,
  variants,
  index,
  onIndexChange,
  onClose,
}: LightboxProps) {
  const [view, setViewState] = useState<View>(START);
  const [dragging, setDragging] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);

  // Зеркало состояния: обработчики жестов срабатывают чаще, чем происходит
  // перерисовка, и им нужно текущее значение, а не то, что было при подписке.
  const viewRef = useRef(START);
  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Активные касания: по двум одновременным считаем щипок.
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);
  // Было ли движение между нажатием и отпусканием: после перетаскивания клик
  // приходит всё равно, и без этой отметки кадр, утащенный мимо своих границ,
  // закрывал бы просмотр.
  const moved = useRef(false);

  const count = images.length;
  const src = images[Math.min(index, count - 1)];

  // Прямоугольник, в котором реально нарисован кадр. object-contain вписывает
  // картинку в рамку, поэтому её размер почти всегда меньше самой рамки — а от
  // него зависит и предел перетаскивания, и попадание клика по фото.
  const drawnRect = useCallback((atView: View) => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img?.naturalWidth) return null;
    const box = stage.getBoundingClientRect();
    const fit = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const w = img.naturalWidth * fit * atView.scale;
    const h = img.naturalHeight * fit * atView.scale;
    return {
      left: box.left + box.width / 2 + atView.offset.x - w / 2,
      top: box.top + box.height / 2 + atView.offset.y - h / 2,
      width: w,
      height: h,
      box,
    };
  }, []);

  // Утащить кадр можно ровно до его краёв: иначе он улетает в пустоту и
  // пользователь теряет его из виду.
  const clampOffset = useCallback(
    (next: Point, atScale: number): Point => {
      const rect = drawnRect({ scale: atScale, offset: { x: 0, y: 0 } });
      if (!rect) return { x: 0, y: 0 };
      const maxX = Math.max(0, (rect.width - rect.box.width) / 2);
      const maxY = Math.max(0, (rect.height - rect.box.height) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [drawnRect]
  );

  // Приближение к точке: под курсором (или между пальцами) должен остаться тот
  // же кусок картинки, иначе кадр «убегает» из-под руки.
  const zoomTo = useCallback(
    (nextScale: number, focus?: Point) => {
      const stage = stageRef.current;
      const { scale, offset } = viewRef.current;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (!stage || clamped === scale) return;
      const box = stage.getBoundingClientRect();
      const center = focus ?? {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
      const dx = center.x - (box.left + box.width / 2);
      const dy = center.y - (box.top + box.height / 2);
      setView({
        scale: clamped,
        offset: clampOffset(
          {
            x: dx - ((dx - offset.x) * clamped) / scale,
            y: dy - ((dy - offset.y) * clamped) / scale,
          },
          clamped
        ),
      });
    },
    [clampOffset, setView]
  );

  const reset = useCallback(() => setView(START), [setView]);

  const go = useCallback(
    (delta: number) => {
      if (count <= 1) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange]
  );

  // Новый кадр — заново с масштабом 1 и незагруженным оригиналом.
  useEffect(() => {
    reset();
    setFullLoaded(false);
  }, [src, reset]);

  // Пока открыт просмотр, страница под ним не должна прокручиваться. Ширину
  // исчезнувшей полосы компенсируем отступом — иначе вёрстка дёргается вбок.
  useEffect(() => {
    const { body } = document;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, []);

  // Фокус уводим внутрь окна и возвращаем на кнопку, с которой его открыли, —
  // иначе после закрытия клавиатура начинает обход страницы с начала.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      switch (event.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          go(-1);
          break;
        case "ArrowRight":
          go(1);
          break;
        case "+":
        case "=":
          zoomTo(viewRef.current.scale * STEP);
          break;
        case "-":
          zoomTo(viewRef.current.scale / STEP);
          break;
        case "0":
          reset();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose, reset, zoomTo]);

  // Колесо мыши приближает, а не прокручивает страницу. Слушатель вешаем сами
  // и неленивым: React подписывает onWheel пассивно, и preventDefault в нём не
  // сработал бы — страница уезжала бы под окном просмотра.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(viewRef.current.scale * Math.exp(-event.deltaY * WHEEL_SENSITIVITY), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef.current.scale,
      };
      dragStart.current = null;
      setDragging(true);
    } else if (viewRef.current.scale > 1) {
      dragStart.current = {
        pointer: { x: event.clientX, y: event.clientY },
        offset: viewRef.current.offset,
      };
      setDragging(true);
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinch = pinchStart.current;
    if (pointers.current.size === 2 && pinch && pinch.dist > 0) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo((dist / pinch.dist) * pinch.scale, {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
      return;
    }

    const drag = dragStart.current;
    if (!drag) return;
    if (
      Math.abs(event.clientX - drag.pointer.x) > 3 ||
      Math.abs(event.clientY - drag.pointer.y) > 3
    ) {
      moved.current = true;
    }
    setView({
      scale: viewRef.current.scale,
      offset: clampOffset(
        {
          x: drag.offset.x + (event.clientX - drag.pointer.x),
          y: drag.offset.y + (event.clientY - drag.pointer.y),
        },
        viewRef.current.scale
      ),
    });
  }

  function endPointer(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      setDragging(false);
    }
  }

  // Клик мимо фото закрывает просмотр — так ведут себя привычные просмотрщики.
  // Проверяем попадание по реальному прямоугольнику кадра, а не по элементу:
  // <img> с object-contain занимает всю сцену, включая пустые поля по бокам, и
  // по цели события «мимо» от «по фото» не отличить.
  function isOnImage(point: Point) {
    const rect = drawnRect(viewRef.current);
    if (!rect) return false;
    return (
      point.x >= rect.left &&
      point.x <= rect.left + rect.width &&
      point.y >= rect.top &&
      point.y <= rect.top + rect.height
    );
  }

  const zoomed = view.scale > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — просмотр фото`}
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
    >
      {/* Верхняя панель: счётчик кадров, кнопки масштаба, закрытие. */}
      <div className="flex items-center justify-between gap-2 p-3 text-white sm:p-4">
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums">
          {count > 1 ? `${index + 1} / ${count}` : "Фото"}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <PanelButton
            label="Уменьшить"
            onClick={() => zoomTo(viewRef.current.scale / STEP)}
            disabled={view.scale <= MIN_SCALE}
          >
            <ZoomIcon sign="out" />
          </PanelButton>
          <span className="w-12 text-center text-sm font-semibold tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
          <PanelButton
            label="Увеличить"
            onClick={() => zoomTo(viewRef.current.scale * STEP)}
            disabled={view.scale >= MAX_SCALE}
          >
            <ZoomIcon sign="in" />
          </PanelButton>
          <PanelButton label="Закрыть" onClick={onClose} ref={closeRef}>
            <CloseIcon />
          </PanelButton>
        </div>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        // Без этого перетаскивание работало ровно один кадр: браузер по
        // движению с зажатой кнопкой над картинкой начинает СВОЁ перетаскивание
        // файла, а оно отменяет указатель (pointercancel), и все последующие
        // pointermove до нас уже не доходят. Проверено в Chromium.
        onDragStart={(event) => event.preventDefault()}
        onClick={(event) => {
          if (moved.current) return;
          if (!isOnImage({ x: event.clientX, y: event.clientY })) onClose();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (zoomed) reset();
          else zoomTo(STEP * STEP, { x: event.clientX, y: event.clientY });
        }}
        // touch-none: иначе браузер перехватывает щипок и тянет всю страницу.
        className={`relative flex-1 touch-none select-none overflow-hidden ${
          zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
      >
        <div className="absolute inset-0 p-2 sm:p-6">
          <div
            className="relative h-full w-full"
            style={{
              transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.scale})`,
              // Во время жеста анимация только мешает: кадр отставал бы от руки.
              transition: dragging ? "none" : "transform 150ms ease-out",
            }}
          >
            {/* Лёгкий вариант — виден сразу, пока грузится оригинал. */}
            <ProductImage
              key={`${src}-preview`}
              src={src}
              alt={alt}
              variants={variantsFor(variants, src)}
              sizes="100vw"
              className="absolute inset-0 h-full w-full object-contain"
              priority
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              key={`${src}-full`}
              src={src}
              alt=""
              aria-hidden="true"
              onLoad={() => setFullLoaded(true)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
                fullLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>

        {count > 1 && (
          <>
            <StageArrow side="left" onClick={() => go(-1)} />
            <StageArrow side="right" onClick={() => go(1)} />
          </>
        )}
      </div>

      {count > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto p-3 sm:justify-center sm:p-4">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === index}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-16 sm:w-16 ${
                i === index
                  ? "border-white"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <ProductImage
                src={url}
                alt=""
                variants={variantsFor(variants, url)}
                sizes="64px"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Кнопка верхней панели.
const PanelButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
  }
>(function PanelButton({ label, onClick, disabled, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
});

// Стрелка переключения кадра поверх сцены.
function StageArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      // Стрелка лежит поверх сцены, а клик по сцене мимо фото закрывает
      // просмотр. Без остановки всплытия переключение кадра его же и закрывало
      // бы. По той же причине гасим нажатие: сцена считает его началом жеста.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "Предыдущее фото" : "Следующее фото"}
      className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      <ChevronIcon direction={side} className="h-6 w-6" />
    </button>
  );
}
