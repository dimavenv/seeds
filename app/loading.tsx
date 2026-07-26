// Глобальное состояние загрузки для серверных страниц (каталог, товар,
// кабинет): раньше при медленной базе переход выглядел как «зависание».
export default function Loading() {
  return (
    <div
      className="container-page py-16 text-center text-brand-500"
      role="status"
      aria-live="polite"
    >
      Загрузка…
    </div>
  );
}
