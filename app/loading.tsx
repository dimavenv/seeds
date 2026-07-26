import Spinner from "@/components/spinner";

// Глобальное состояние загрузки для серверных страниц (каталог, товар,
// кабинет): раньше при медленной базе переход выглядел как «зависание».
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
