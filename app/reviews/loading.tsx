import Spinner from "@/components/spinner";

// Индикатор загрузки для страницы отзывов.
//
// Здесь loading-граница безопасна: /reviews не вызывает notFound() и не имеет
// вложенных роутов, поэтому стриминг ответа не мешает вернуть корректный код.
// Прежний ГЛОБАЛЬНЫЙ app/loading.tsx убран именно поэтому: он висел над
// карточкой товара и категорией, ответ начинал уходить раньше notFound(), и
// несуществующие адреса отдавали 200 вместо 404. Обратную связь при переходах
// по всему сайту теперь даёт components/navigation-progress.tsx.
//
// Страница объявлена force-dynamic и читает до 100 отзывов из базы, так что
// показать каркас сразу тут действительно полезно.
export default function Loading() {
  return (
    <div
      className="container-page flex flex-col items-center gap-3 py-16 text-center text-brand-500"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8" />
      Загрузка…
    </div>
  );
}
