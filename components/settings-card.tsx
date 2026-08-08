// Карточка раздела настроек кабинета: круглая иконка, заголовок, пояснение и
// содержимое. Отдельным компонентом — чтобы «Мои данные» и «Безопасность»
// выглядели одинаково и не расползались по мере добавления разделов.
export default function SettingsCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card h-full p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-brand-800">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-brand-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
