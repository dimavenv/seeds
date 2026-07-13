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
};

export default nextConfig;
