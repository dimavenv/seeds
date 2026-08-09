import Link from "next/link";

// Переключатель «Вход | Регистрация» в шапке карточки.
//
// Раньше вход и регистрация связывались строчкой «Нет аккаунта?
// Зарегистрироваться» под кнопкой — её приходилось искать глазами внизу
// формы. Переключатель стоит там, где человек смотрит первым делом, и сразу
// показывает, что страниц две и на какой он сейчас.
export default function AuthTabs({ active }: { active: "login" | "register" }) {
  const tab = (on: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
      on
        ? "bg-surface text-brand-800 shadow-sm"
        : "text-brand-500 hover:text-brand-700"
    }`;

  return (
    <div
      className="mb-6 flex gap-1 rounded-full bg-brand-100 p-1"
      role="tablist"
      aria-label="Вход или регистрация"
    >
      <Link
        href="/login"
        role="tab"
        aria-selected={active === "login"}
        aria-current={active === "login" ? "page" : undefined}
        className={tab(active === "login")}
      >
        Вход
      </Link>
      <Link
        href="/register"
        role="tab"
        aria-selected={active === "register"}
        aria-current={active === "register" ? "page" : undefined}
        className={tab(active === "register")}
      >
        Регистрация
      </Link>
    </div>
  );
}
