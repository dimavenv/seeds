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
    ],
  },
};

export default nextConfig;
