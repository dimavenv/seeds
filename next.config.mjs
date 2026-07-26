/** @type {import('next').NextConfig} */
const nextConfig = {
  // Автономная сборка для запуска на VPS под pm2 (см. SETUP-VPS-RU.md).
  // На Vercel эта опция ни на что не влияет — деплой туда работает как раньше.
  output: "standalone",
  images: {
    // Не оптимизируем картинки на сервере: на медленном канале серверный fetch
    // к удалённым картинкам висел минутами и забивал dev-сервер.
    // Браузер грузит src напрямую; реальные фото из PocketBase — тоже.
    unoptimized: true,
    remotePatterns: [
      // Фото товаров из PocketBase (свой сервер)
      { protocol: "https", hostname: "api.tomatsemena.ru" },
      { protocol: "http", hostname: "**" }, // до домена: http://IP:8090
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Заголовки безопасности на уровне приложения (работают и на Vercel, и на VPS,
  // где nginx добавляет их дополнительно). CSP здесь намеренно ограничивает
  // только то, что НЕ зависит от внешних origin'ов (PocketBase, DaData,
  // SmartCaptcha грузятся с динамических адресов): защита от кликджекинга
  // (frame-ancestors), подмены base href (base-uri) и плагинов (object-src).
  // Полноценный script-src/connect-src с nonce задаётся на nginx — см.
  // deploy/nginx.conf и раздел CSP в аудите.
  async headers() {
    const csp = [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://pay.alfabank.ru https://payment.alfabank.ru https://alfa.rbsuat.com",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
