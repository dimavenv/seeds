"use client";

import { useEffect, useRef, useState } from "react";
import { CartIcon, CheckIcon } from "@/components/icons";

// Единая кнопка «В корзину» с обратной связью: по клику подпись плавно
// сменяется на «Добавлено» (галочка + зелёный фон), через addedMs кнопка
// возвращается в исходный вид. Обе подписи наложены в одной грид-ячейке —
// ширина зарезервирована по большей из них, кнопка не «прыгает».
// Используется везде, где есть добавление в корзину (карточка в каталоге,
// страница товара, «Заказать ещё раз»), чтобы поведение совпадало.
export default function AddToCartButton({
  onAdd,
  label = "В корзину",
  addedLabel = "Добавлено",
  className = "",
  iconClassName = "h-5 w-5",
  hideLabelOnMobile = false,
  disabled = false,
  addedMs = 1600,
}: {
  onAdd: () => void;
  label?: string;
  addedLabel?: string;
  className?: string;
  iconClassName?: string;
  // Карточка каталога: на телефоне только иконка, подпись с sm.
  hideLabelOnMobile?: boolean;
  disabled?: boolean;
  addedMs?: number;
}) {
  const [added, setAdded] = useState(false);
  // Таймер возврата гасим при размонтировании (нет setState на снятом компоненте).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function click() {
    onAdd();
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), addedMs);
  }

  const labelCls = hideLabelOnMobile ? "hidden sm:inline" : "";
  // Слой подписи: обе занимают одну грид-ячейку, активная видима.
  const layer = (visible: boolean) =>
    `col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-200 ${
      visible ? "opacity-100" : "opacity-0"
    }`;

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      aria-label={label}
      className={`btn text-white transition-colors duration-300 ${
        added
          ? "bg-brand-500 hover:bg-brand-600"
          : "bg-accent-500 hover:bg-accent-600"
      } ${className}`}
    >
      <span className="grid">
        <span aria-hidden={added} className={layer(!added)}>
          <CartIcon className={iconClassName} />
          {label && <span className={labelCls}>{label}</span>}
        </span>
        <span aria-hidden={!added} className={layer(added)}>
          <CheckIcon
            className={`${iconClassName} ${added ? "motion-safe:animate-pop-in" : ""}`}
          />
          {addedLabel && <span className={labelCls}>{addedLabel}</span>}
        </span>
      </span>
      {/* Объявление для скринридеров — визуальная смена подписи наложением
          сама по себе не озвучивается. */}
      <span className="sr-only" role="status">
        {added ? "Товар добавлен в корзину" : ""}
      </span>
    </button>
  );
}
