import Script from "next/script";

// Счётчики аналитики. Оба подключаются ТОЛЬКО если задан соответствующий id в
// окружении — на стенде и в разработке переменные пустые, и тогда в HTML не
// попадает ни строчки скрипта (иначе локальные визиты пачкали бы статистику).
//
// Яндекс.Метрика для нас важнее GA4: поведенческие данные из неё — реальный
// сигнал ранжирования в Яндексе, а Вебвизор нужен, чтобы видеть, где
// покупатель бросает оформление заказа.
//
// Оба id публичные (NEXT_PUBLIC_*) — они по определению уходят в браузер,
// секрета в них нет. Обращаемся к process.env по полному имени: Next заменяет
// такие обращения на значения при сборке, динамический доступ не сработает.
export default function Analytics() {
  const metrikaId = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim();

  return (
    <>
      {metrikaId && (
        <>
          <Script id="yandex-metrika" strategy="afterInteractive">
            {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${JSON.stringify(metrikaId)}, "init", {
  clickmap:true,
  trackLinks:true,
  accurateTrackBounce:true,
  webvisor:true,
  ecommerce:"dataLayer"
});`}
          </Script>
          {/* Запасной вариант для браузеров с отключённым JS: без него в
              Метрике теряется часть визитов, а Вебмастер ругается на счётчик. */}
          <noscript>
            <div>
              <img
                src={`https://mc.yandex.ru/watch/${metrikaId}`}
                style={{ position: "absolute", left: "-9999px" }}
                alt=""
              />
            </div>
          </noscript>
        </>
      )}

      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(gaId)});`}
          </Script>
        </>
      )}
    </>
  );
}
