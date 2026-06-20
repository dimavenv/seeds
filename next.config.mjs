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
};

export default nextConfig;
