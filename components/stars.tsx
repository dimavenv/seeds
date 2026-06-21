// Показ рейтинга звёздами (презентационный, без состояния).
export default function Stars({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`text-accent-500 ${className}`} aria-label={`${value} из 5`}>
      {"★★★★★".slice(0, value)}
      <span className="text-brand-200">{"★★★★★".slice(value)}</span>
    </span>
  );
}
