"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  DELIVERY_COST,
  DELIVERY_METHODS,
  deliveryCostFor,
  type DeliveryMethodId,
} from "@/lib/delivery";

// Карточки выбора способа доставки на оформлении заказа. Выбранная — с
// зелёной рамкой и галочкой в круге; внутри логотип, стоимость (перечёркнута,
// если для этой суммы доставка бесплатна), условие бесплатной доставки и срок.
export default function DeliveryMethodCards({
  value,
  subtotal,
  onChange,
}: {
  value: DeliveryMethodId;
  subtotal: number;
  onChange: (id: DeliveryMethodId) => void;
}) {
  // Логотипы лежат в /public; пока файла нет — показываем эмодзи-заглушку.
  const [brokenIcons, setBrokenIcons] = useState<Record<string, boolean>>({});

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DELIVERY_METHODS.map((m) => {
        const active = value === m.id;
        const cost = deliveryCostFor(m.id, subtotal);
        const free = cost === 0;
        return (
          <label
            key={m.id}
            className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition ${
              active
                ? "border-brand-500 bg-brand-50/60 shadow-sm"
                : "border-brand-200 bg-surface hover:border-brand-300"
            }`}
          >
            <input
              type="radio"
              name="delivery_method"
              value={m.id}
              checked={active}
              onChange={() => onChange(m.id)}
              className="sr-only"
            />

            {/* Галочка выбора в правом верхнем углу */}
            <span
              aria-hidden="true"
              className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border-2 transition ${
                active
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-brand-200 bg-surface text-transparent"
              }`}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5l3.5 3.5L13 4.5" />
              </svg>
            </span>

            {/* Логотип службы доставки */}
            <span className="flex h-10 items-center">
              {brokenIcons[m.id] ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-xl">
                  {m.id === "post" ? "📮" : "📦"}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.icon}
                  alt=""
                  className="h-10 w-auto max-w-[120px] object-contain"
                  onError={() =>
                    setBrokenIcons((b) => ({ ...b, [m.id]: true }))
                  }
                />
              )}
            </span>

            <span className="pr-7 font-bold leading-snug text-brand-800">
              {m.title}{" "}
              <span className="font-semibold text-brand-500">
                ({m.subtitle})
              </span>
            </span>

            <span className="text-sm text-brand-700">
              Стоимость доставки:{" "}
              {free ? (
                <>
                  <span className="text-brand-400 line-through">
                    {formatPrice(DELIVERY_COST)}
                  </span>{" "}
                  <span className="font-bold text-brand-600">бесплатно</span>
                </>
              ) : (
                <span className="font-bold text-brand-800">
                  {formatPrice(cost)}
                </span>
              )}
            </span>

            {m.freeFrom != null && (
              <span className="text-sm font-bold uppercase text-brand-600">
                Бесплатно при заказе от {formatPrice(m.freeFrom)}
              </span>
            )}

            <span className="text-sm text-brand-500">
              Срок обработки и отправки заказа:{" "}
              <span className="font-semibold text-brand-700">{m.days}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
