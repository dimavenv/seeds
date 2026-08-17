"use client";

import { useEffect } from "react";

// Последний рубеж: сбой в самом корневом layout (шапка, подвал, провайдер
// корзины). Обычная граница app/error.tsx живёт ВНУТРИ layout и в этом случае
// уже не отрисуется, поэтому здесь приходится отдавать собственные <html> и
// <body> — своих стилей и шрифтов сайта тут тоже нет, всё оформление инлайном.
//
// Случай редкий, но именно он выглядит как «сайт не работает», поэтому он тоже
// должен говорить по-человечески и предлагать выход.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f8f2",
          color: "#26332a",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem" }}>🌧️</div>
          <h1 style={{ fontSize: "1.5rem", margin: "16px 0 8px", color: "#1d4220" }}>
            Сайт временно не отвечает
          </h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.6, color: "#5c6b5c" }}>
            Мы уже видим эту ошибку. Попробуйте обновить страницу через минуту —
            заказы и корзина сохранены.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: "999px",
              padding: "12px 24px",
              fontSize: "1rem",
              fontWeight: 700,
              color: "#fff",
              background: "#2e7d32",
            }}
          >
            Обновить
          </button>
          {error.digest && (
            <p style={{ marginTop: "24px", fontSize: "0.75rem", color: "#8a998a" }}>
              Код ошибки: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
