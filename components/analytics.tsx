"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { COOKIE_CONSENT_EVENT, hasCookieConsent } from "@/lib/cookie-consent";

// Яндекс.Метрика. Подключается ТОЛЬКО если задан номер счётчика в окружении —
// на стенде и в разработке переменная пустая, и тогда в HTML не попадает ни
// строчки скрипта (иначе локальные визиты пачкали бы статистику).
//
// И только ПОСЛЕ согласия на cookies. Это требование не техническое, а
// юридическое: данные, которые собирает Метрика (cookie-идентификатор, IP,
// записи Вебвизора), Роскомнадзор считает персональными, а раздел 7 политики
// конфиденциальности обещает посетителю, что до нажатия «Хорошо» аналитика не
// запускается. Поэтому счётчик рендерится не сразу, а по состоянию согласия.
//
// Google Analytics здесь намеренно нет. Он передаёт данные посетителей за
// границу, а 152-ФЗ требует обрабатывать персональные данные россиян на
// серверах в России — это самое частое нарушение у небольших магазинов.
// Метрика закрывает ту же задачу и вдобавок даёт сигнал ранжирования в
// Яндексе и Вебвизор, по которому видно, где покупатель бросает оформление.
//
// Номер счётчика публичный (NEXT_PUBLIC_*) — он по определению уходит в
// браузер, секрета в нём нет. Обращаемся к process.env по полному имени: Next
// заменяет такие обращения на значения при сборке, динамический доступ не
// сработает.
export default function Analytics() {
  const metrikaId = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  // На сервере согласие неизвестно, поэтому стартуем с false: в первый HTML
  // скрипты не попадают никогда, и гидратация проходит без расхождений.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(hasCookieConsent());
    // Согласие может появиться прямо сейчас — плашка сообщает о нажатии
    // событием, и счётчик подключается без перезагрузки страницы.
    const onConsent = () => setAllowed(true);
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  if (!allowed) return null;

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
          {/* Пиксель для браузеров с отключённым JS. С тех пор как счётчик
              подключается по согласию, до него доходят только те, у кого JS
              работает, — но Вебмастер ругается на счётчик без noscript, а
              рисовать его в HTML до согласия нельзя: это тот же сбор данных. */}
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
    </>
  );
}
