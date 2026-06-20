"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

// Применить тему к <html>: для system смотрим системную настройку браузера.
function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme) || "system";
    setTheme(stored);
    setMounted(true);
    // Реакция на смену системной темы, пока выбран режим «как в системе».
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("theme") || "system") === "system")
        apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    localStorage.setItem("theme", next);
    apply(next);
  }

  // До монтирования рисуем нейтральную заглушку (без рассинхрона гидрации).
  const icon = !mounted
    ? "🌓"
    : theme === "light"
    ? "☀️"
    : theme === "dark"
    ? "🌙"
    : "🖥️";
  const label =
    theme === "light"
      ? "Тема: светлая"
      : theme === "dark"
      ? "Тема: тёмная"
      : "Тема: как в системе";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="rounded-full p-2 text-base leading-none text-brand-700 hover:bg-brand-100 sm:p-2.5"
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}
