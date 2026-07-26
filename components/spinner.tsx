// Единый индикатор загрузки (вместо голого текста «Загрузка…»).
// aria-hidden: подпись даёт вызывающая сторона (role="status" + текст).
export default function Spinner({
  className = "h-6 w-6",
}: {
  className?: string;
}) {
  return (
    <svg
      className={`animate-spin text-brand-400 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
