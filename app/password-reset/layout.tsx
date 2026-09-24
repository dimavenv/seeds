import { servicePageMetadata } from "@/lib/seo";

// Только метаданные: страница — клиентский компонент, а он экспортировать
// metadata не может (см. servicePageMetadata — там же и причина, зачем это
// нужно). Разметку layout не добавляет.
export const metadata = {
  ...servicePageMetadata("/password-reset", "Смена пароля"),
  // Одноразовый токен не должен уходить внешним сайтам через Referer.
  referrer: "no-referrer" as const,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
