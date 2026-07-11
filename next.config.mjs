/** @type {import('next').NextConfig} */
const nextConfig = {
  // Автономная сборка для запуска на VPS под pm2 (см. SETUP-VPS-RU.md).
  // На Vercel эта опция ни на что не влияет — деплой туда работает как раньше.
  output: "standalone",
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
};

export default nextConfig;
