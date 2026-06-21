/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Не оптимизируем картинки на сервере: на медленном канале серверный fetch
    // к удалённым картинкам (picsum и т.п.) висел минутами и забивал dev-сервер.
    // Браузер грузит src напрямую; реальные фото из Supabase Storage — тоже.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
      // Картинки товаров Ozon (режим импорта --link-images)
      { protocol: "https", hostname: "**.ozone.ru" },
      { protocol: "https", hostname: "**.ozon.ru" },
    ],
  },
  // Базовые security-заголовки на все ответы (аудит #5):
  // защита от кликджекинга, MIME-sniffing, утечки реферера.
  async headers() {
    const securityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
