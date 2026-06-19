type IconProps = { className?: string };

export function CartIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    </svg>
  );
}

export function HeartIcon({ className = "h-5 w-5", filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 8.6c0 4.5-7.2 9.1-8.8 10-1.6-.9-8.8-5.5-8.8-10A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.6z" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function LeafIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 4.5-9 16-9 0 8-4 12-9 12z" />
      <path d="M4 21c2-6 6-8 11-9" />
    </svg>
  );
}

export function UserIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

// Дефолтный логотип-метка «Tomat Semena»: помидор (красное тело + зелёный
// листик). Цвета заданы явно, не зависят от currentColor.
export function TomatoIcon({ className = "h-9 w-9" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="14.5" r="7.5" fill="#e63b2e" />
      <path
        d="M12 14.5c1.6-1 3.4-1.4 5.2-1.1-.5 1.8-2.1 3-4 3-.4-.6-.8-1.2-1.2-1.9z"
        fill="#c92f24"
      />
      <path
        d="M12 8.2c-1-1.6-2.7-2.6-4.6-2.7 0 1.3.6 2.5 1.6 3.3.9-.4 1.9-.6 3-.6zm0 0c1-1.6 2.7-2.6 4.6-2.7 0 1.3-.6 2.5-1.6 3.3-.9-.4-1.9-.6-3-.6z"
        fill="#3f9b46"
      />
      <path d="M12 5.2c.5-.9 1.3-1.6 2.3-1.9-.1 1-.7 1.9-1.6 2.4-.3-.1-.5-.3-.7-.5z" fill="#4cae53" />
      <rect x="11.3" y="6.4" width="1.4" height="2.4" rx="0.7" fill="#3f9b46" />
    </svg>
  );
}

