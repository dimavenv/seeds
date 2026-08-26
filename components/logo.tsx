"use client";

import { useState } from "react";
import { LeafIcon } from "@/components/icons";

// Светлая тема: public/logo.webp, тёмная: public/logo-dark.webp.
// Если файл не найден — LeafIcon как фолбэк (onError ниже), поэтому сайт не
// ломается, даже если файл ещё не залит.
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
        <img
          src="/logo.webp"
          alt="Tomat Semena"
          className={`${imgClass} dark:hidden`}
          onError={() => setLightFailed(true)}
        />
      )}

      {/* Тёмный логотип: виден только в тёмной теме */}
      {darkFailed ? (
        <LeafIcon className={`${imgClass} hidden dark:block`} />
      ) : (
        <img
          src="/logo-dark.webp"
          alt="Tomat Semena"
          className={`${imgClass} hidden dark:block`}
          onError={() => setDarkFailed(true)}
        />
      )}
    </>
  );
}
