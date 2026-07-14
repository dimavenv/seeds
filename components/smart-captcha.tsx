"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY;

declare global {
  interface Window {
    smartCaptcha?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => number;
      reset: (id?: number) => void;
      destroy: (id: number) => void;
    };
  }
}

// Тема виджета берётся с сайта: тёмная, если на <html> висит класс dark
// (его ставит переключатель темы). SmartCaptcha сам тему не переключает —
// параметр передаётся при отрисовке, а при смене темы виджет перерисовываем.
function siteTheme(): "light" | "dark" {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

// Виджет Yandex SmartCaptcha. Если ключ не задан — ничего не рендерит и не
// мешает форме (капча просто выключена).
export default function SmartCaptcha({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const currentTheme = useRef<"light" | "dark">("light");
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !window.smartCaptcha || !ref.current) return;
      currentTheme.current = siteTheme();
      widgetId.current = window.smartCaptcha.render(ref.current, {
        sitekey: SITE_KEY,
        hl: "ru",
        theme: currentTheme.current,
        callback: (t: string) => cb.current(t),
      });
    }

    function waitAndRender() {
      if (cancelled || widgetId.current !== null) return;
      if (window.smartCaptcha && ref.current) renderWidget();
      else setTimeout(waitAndRender, 200);
    }

    // Перерисовать виджет при смене темы сайта (класс dark на <html>).
    const observer = new MutationObserver(() => {
      if (widgetId.current === null || !window.smartCaptcha) return;
      const next = siteTheme();
      if (next === currentTheme.current) return;
      cb.current(""); // тема сменилась — сбрасываем прошлый токен
      window.smartCaptcha.destroy(widgetId.current);
      widgetId.current = null;
      renderWidget();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (!document.getElementById("smartcaptcha-script")) {
      const s = document.createElement("script");
      s.id = "smartcaptcha-script";
      s.src = "https://smartcaptcha.yandexcloud.net/captcha.js";
      s.defer = true;
      document.head.appendChild(s);
    }
    waitAndRender();

    return () => {
      cancelled = true;
      observer.disconnect();
      if (widgetId.current !== null && window.smartCaptcha) {
        window.smartCaptcha.destroy(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-1" />;
}

// Включена ли капча на клиенте (задан публичный ключ).
export const captchaEnabled = Boolean(SITE_KEY);
