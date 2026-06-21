"use client";

import { useState } from "react";
import { LeafIcon } from "@/components/icons";

// Светлая тема: public/logo.png, тёмная: public/logo-dark.png.
// Если файл не найден — LeafIcon как фолбэк.
export default function Logo({ className = "h-9 w-9" }: { className?: string }) {
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  const imgClass = `${className} object-contain`;

  return (
    <>
      {/* Светлый логотип: скрыт в тёмной теме */}
      {lightFailed ? (
        <LeafIcon className={`${imgClass} dark:hidden`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo.png"
          alt="Tomat Semena"
          className={`${imgClass} dark:hidden`}
          onError={() => setLightFailed(true)}
        />
      )}

      {/* Тёмный логотип: виден только в тёмной теме */}
      {darkFailed ? (
        <LeafIcon className={`${imgClass} hidden dark:block`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/logo-dark.png"
          alt="Tomat Semena"
          className={`${imgClass} hidden dark:block`}
          onError={() => setDarkFailed(true)}
        />
      )}
    </>
  );
}
