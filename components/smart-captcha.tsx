"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY;
const SCRIPT_ID = "smartcaptcha-script";
const SCRIPT_READY_EVENT = "smartcaptcha-script-ready";
const SCRIPT_ERROR_EVENT = "smartcaptcha-script-error";

declare global {
  interface Window {
    smartCaptcha?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => number;
      execute: (id?: number) => void;
      reset: (id?: number) => void;
      destroy: (id: number) => void;
      subscribe: (
        id: number,
        event:
          | "network-error"
          | "javascript-error"
          | "token-expired",
        callback: () => void
      ) => () => void;
    };
    __smartCaptchaOnload?: () => void;
  }
}

export type SmartCaptchaHandle = {
  execute: () => void;
  reset: () => void;
};

type Props = {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
};

// Невидимая SmartCaptcha запускается только через execute(), обычно после
// submit формы. Если запрос выглядит обычным, пользователь ничего не увидит;
// подозрительному запросу Яндекс покажет задание.
const SmartCaptcha = forwardRef<SmartCaptchaHandle, Props>(function SmartCaptcha(
  { onToken, onError },
  forwardedRef
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const pendingExecute = useRef(false);
  const awaitingToken = useRef(false);
  const scriptLoadFailed = useRef(false);
  const unsubscribe = useRef<Array<() => void>>([]);
  const tokenCallback = useRef(onToken);
  const errorCallback = useRef(onError);
  tokenCallback.current = onToken;
  errorCallback.current = onError;

  function resetWidget() {
    pendingExecute.current = false;
    awaitingToken.current = false;
    if (widgetId.current !== null && window.smartCaptcha) {
      window.smartCaptcha.reset(widgetId.current);
    }
  }

  function clearSubscriptions() {
    for (const stop of unsubscribe.current) stop();
    unsubscribe.current = [];
  }

  useImperativeHandle(
    forwardedRef,
    () => ({
      execute() {
        awaitingToken.current = true;
        if (scriptLoadFailed.current) {
          awaitingToken.current = false;
          errorCallback.current?.(
            "Не удалось загрузить проверку от роботов. Обновите страницу и попробуйте ещё раз."
          );
          return;
        }
        if (widgetId.current !== null && window.smartCaptcha) {
          window.smartCaptcha.execute(widgetId.current);
        } else {
          // Пользователь может нажать submit раньше, чем загрузился скрипт.
          // Запускаем проверку сразу после отрисовки виджета.
          pendingExecute.current = true;
        }
      },
      reset: resetWidget,
    }),
    []
  );

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function reportError() {
      const active = awaitingToken.current || pendingExecute.current;
      pendingExecute.current = false;
      awaitingToken.current = false;
      if (active) {
        errorCallback.current?.(
          "Не удалось загрузить проверку от роботов. Обновите страницу и попробуйте ещё раз."
        );
      }
    }

    function reportExpired() {
      const active = awaitingToken.current || pendingExecute.current;
      pendingExecute.current = false;
      awaitingToken.current = false;
      if (active) {
        errorCallback.current?.(
          "Время проверки истекло. Нажмите кнопку ещё раз."
        );
      }
    }

    function reportScriptError() {
      scriptLoadFailed.current = true;
      reportError();
    }

    function renderWidget() {
      if (cancelled || !window.smartCaptcha || !containerRef.current) return;
      widgetId.current = window.smartCaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        invisible: true,
        hl: "ru",
        // Не скрываем обязательное уведомление SmartCaptcha об обработке данных.
        hideShield: false,
        shieldPosition: "bottom-right",
        callback: (token: string) => {
          if (
            awaitingToken.current &&
            typeof token === "string" &&
            token.length > 0
          ) {
            awaitingToken.current = false;
            tokenCallback.current(token);
          }
        },
      });
      unsubscribe.current = [
        window.smartCaptcha.subscribe(
          widgetId.current,
          "network-error",
          reportError
        ),
        window.smartCaptcha.subscribe(
          widgetId.current,
          "javascript-error",
          reportError
        ),
        window.smartCaptcha.subscribe(
          widgetId.current,
          "token-expired",
          reportExpired
        ),
      ];
      if (pendingExecute.current) {
        pendingExecute.current = false;
        window.smartCaptcha.execute(widgetId.current);
      }
    }

    function waitAndRender() {
      if (cancelled || widgetId.current !== null) return;
      if (window.smartCaptcha && containerRef.current) renderWidget();
      else retryTimer = setTimeout(waitAndRender, 200);
    }

    window.addEventListener(SCRIPT_READY_EVENT, waitAndRender);
    window.addEventListener(SCRIPT_ERROR_EVENT, reportScriptError);

    if (!document.getElementById(SCRIPT_ID)) {
      window.__smartCaptchaOnload = () =>
        window.dispatchEvent(new Event(SCRIPT_READY_EVENT));
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload&onload=__smartCaptchaOnload";
      script.defer = true;
      script.onerror = () => window.dispatchEvent(new Event(SCRIPT_ERROR_EVENT));
      document.head.appendChild(script);
    }
    waitAndRender();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener(SCRIPT_READY_EVENT, waitAndRender);
      window.removeEventListener(SCRIPT_ERROR_EVENT, reportScriptError);
      if (widgetId.current !== null && window.smartCaptcha) {
        clearSubscriptions();
        window.smartCaptcha.destroy(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} />;
});

export default SmartCaptcha;

// Включена ли капча на клиенте (задан публичный ключ).
export const captchaEnabled = Boolean(SITE_KEY);
