// ===== Content-Security-Policy =====
//
// Что CSP здесь реально даёт: браузер не выполнит скрипт и не отправит запрос
// на посторонний адрес, даже если такой адрес каким-то образом попал в
// разметку. Плюс запрещены фреймы (кликджекинг), подмена base href, плагины и
// отправка форм куда-либо, кроме сайта и Robokassa.
//
// Почему в script-src остаётся 'unsafe-inline'. App Router отдаёт данные
// страницы встроенными <script>self.__next_f.push(...)</script> — их содержимое
// меняется от запроса к запросу, поэтому под хеш они не подводятся. Остаётся
// nonce, но nonce требует, чтобы КАЖДАЯ страница собиралась на запрос: статики
// и ISR у сайта не останется, а он на них и держится (каталог, карточки
// товара, статьи). Для магазина на одном VPS это плохой размен: XSS-поверхности
// здесь почти нет (пользовательский текст нигде не выводится через
// dangerouslySetInnerHTML), а рендер каждой страницы на каждый заход — вполне
// реальная нагрузка. Поэтому ограничиваем ИСТОЧНИКИ скриптов, а инлайн
// разрешаем.
//
// Адреса внешних сервисов заданы явно. Если подключаете новый (или CSP что-то
// сломала), сначала проверьте в режиме отчётов: CSP_REPORT_ONLY=1 в
// .env.production — браузер не будет блокировать, но напишет в консоль, что
// заблокировал бы.
function contentSecurityPolicy() {
  // PocketBase может стоять на своём поддомене (https://api.tomatsemena.ru)
  // или на том же домене по /pb — во втором случае это 'self'.
  let pbOrigin = "";
  try {
    pbOrigin = new URL(process.env.NEXT_PUBLIC_PB_URL ?? "").origin;
  } catch {
    pbOrigin = "";
  }

  const metrika = ["https://mc.yandex.ru", "https://mc.yandex.com"];
  const captcha = [
    "https://smartcaptcha.cloud.yandex.ru",
    "https://smartcaptcha.yandexcloud.net",
    "https://captcha-api.yandex.ru",
  ];
  const robokassa = ["https://auth.robokassa.ru"];

  const directives = {
    "default-src": ["'self'"],
    // 'unsafe-inline' — см. пояснение выше; 'unsafe-eval' НЕ разрешаем.
    "script-src": ["'self'", "'unsafe-inline'", ...metrika, ...captcha],
    // Tailwind и inline-стили компонентов, виджет капчи рисует свои стили.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", pbOrigin, ...metrika],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      pbOrigin,
      // DaData здесь нет намеренно: подсказки адреса идут через собственный
      // прокси /api/dadata (токен не должен попадать в браузер), значит
      // напрямую браузер туда не ходит — и разрешать этот адрес незачем.
      ...metrika,
      ...captcha,
    ],
    // Капча рисует себя во фрейме; Метрика использует фрейм для синхронизации.
    "frame-src": ["'self'", ...captcha, ...metrika],
    // Оплата уходит POST-формой на Robokassa — это единственный внешний
    // адрес, куда сайту можно отправлять формы.
    "form-action": ["'self'", ...robokassa],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => {
      const list = Array.from(new Set(values.filter(Boolean)));
      return list.length ? `${name} ${list.join(" ")}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

const cspHeaderName =
  process.env.CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Автономная сборка для запуска на VPS под pm2 (см. SETUP-VPS-RU.md).
  // На Vercel эта опция ни на что не влияет — деплой туда работает как раньше.
  output: "standalone",
  // Карты исходников наружу не отдаём: по ним читается серверная логика
  // проверок (nginx их тоже режет, но сборка не должна на это полагаться).
  productionBrowserSourceMaps: false,
  images: {
    // Не оптимизируем картинки на сервере: на медленном канале серверный fetch
    // к удалённым картинкам висел минутами и забивал dev-сервер.
    // Браузер грузит src напрямую; реальные фото из PocketBase — тоже.
    unoptimized: true,
    // Список закрытый. Раньше здесь стоял { protocol: "http", hostname: "**" }
    // (нужен был до домена, чтобы тянуть фото с http://IP:8090). Сейчас он
    // безвреден только потому, что оптимизатор выключен: включите его — и
    // /_next/image превратится в открытый прокси, которым с сервера дёргают
    // 127.0.0.1:8090 и метаданные хостера (SSRF, аудит 7.3).
    remotePatterns: [
      // Фото товаров из PocketBase (свой сервер)
      { protocol: "https", hostname: "api.tomatsemena.ru" },
      { protocol: "https", hostname: "tomatsemena.ru" },
      // Демо-каталог без базы
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Заголовки безопасности на уровне приложения (работают и на Vercel, и на
  // VPS). nginx добавляет свой короткий CSP как подстраховку на случай, если
  // запрос до Next не дошёл; браузер применяет оба заголовка одновременно, и
  // ограничения складываются — короткий не ослабляет этот.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: cspHeaderName, value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(), payment=()",
          },
          // Изоляция от чужих вкладок, открытых через window.open.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
