"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Полоска прогресса вверху экрана на время перехода между страницами.
//
// Зачем она вместо прежнего глобального app/loading.tsx: тот файл включал
// стриминг для ВСЕХ серверных страниц, а из-за стриминга заголовки ответа
// уходят браузеру раньше, чем выполнится notFound() — и несуществующий товар
// отдавал 200 OK вместо 404 (мягкий 404, Search Console считает это ошибкой).
// Полоска даёт ту же обратную связь при переходах, но живёт целиком на
// клиенте и на код ответа не влияет вообще.
//
// Работает на любых переходах, включая карточку товара и категорию, где
// loading-границы теперь нет намеренно.
const MAX_VISIBLE_MS = 10000;

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Переход завершился — адрес поменялся, прячем полоску.
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!active) {
      if (timeout.current) clearTimeout(timeout.current);
      return;
    }
    // Страховка: если переход сорвался (сеть отвалилась, клик не привёл к
    // навигации), полоска не должна висеть вечно.
    timeout.current = setTimeout(() => setActive(false), MAX_VISIBLE_MS);
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [active]);

  useEffect(() => {
    // Слушаем клики в фазе перехвата: сработает раньше, чем Next начнёт
    // переход, и не зависит от того, через какой компонент сделана ссылка.
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;

      const link = (event.target as HTMLElement | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;

      const href = link.getAttribute("href");
      // Якоря, mailto:, tel: и прочее — это не переход по страницам.
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Клик по ссылке на текущую же страницу — перехода не будет.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;

      setActive(true);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-brand-100"
      role="status"
      aria-live="polite"
      aria-label="Загрузка страницы"
    >
      <div className="h-full w-1/3 animate-nav-progress rounded-full bg-accent-500" />
    </div>
  );
}
