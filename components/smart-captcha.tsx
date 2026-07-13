"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY;

declare global {
  interface Window {
    smartCaptcha?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => number;
      reset: (id?: number) => void;
    };
  }
}

// Виджет Yandex SmartCaptcha. Если ключ не задан — ничего не рендерит и не
// мешает форме (капча просто выключена).
export default function SmartCaptcha({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    function tryRender() {
      if (cancelled || rendered.current) return;
      if (window.smartCaptcha && ref.current) {
        rendered.current = true;
        window.smartCaptcha.render(ref.current, {
          sitekey: SITE_KEY,
          hl: "ru",
          callback: (t: string) => cb.current(t),
        });
      } else {
        setTimeout(tryRender, 200);
      }
    }

    if (!document.getElementById("smartcaptcha-script")) {
      const s = document.createElement("script");
      s.id = "smartcaptcha-script";
      s.src = "https://smartcaptcha.yandexcloud.net/captcha.js";
      s.defer = true;
      document.head.appendChild(s);
    }
    tryRender();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-1" />;
}

// Включена ли капча на клиенте (задан публичный ключ).
export const captchaEnabled = Boolean(SITE_KEY);
