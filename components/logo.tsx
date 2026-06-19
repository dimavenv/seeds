"use client";

import { useState } from "react";
import { TomatoIcon } from "@/components/icons";

// Логотип-метка. Показывает свой файл public/logo.png, если он загружен;
// иначе — дефолтный помидор (TomatoIcon). Текст названия — отдельно в шапке.
export default function Logo({ className = "h-9 w-9" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <TomatoIcon className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Tomat Semena"
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
}
