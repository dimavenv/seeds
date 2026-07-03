"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Обёртка «появление при прокрутке»: блок плавно выезжает снизу, когда
// попадает в зону видимости. Стили — в globals.css (.reveal / .reveal-visible),
// они действуют только при prefers-reduced-motion: no-preference, а без JS
// контент виден сразу (класс .reveal ставится только после монтирования).
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Блоки, уже попавшие в первый экран, показываем сразу — без мигания.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${mounted ? "reveal" : ""} ${visible ? "reveal-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
