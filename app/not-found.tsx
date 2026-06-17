import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <div className="text-6xl">🌱</div>
      <h1 className="mt-4 text-3xl font-bold text-brand-800">
        Страница не найдена
      </h1>
      <p className="mt-2 text-brand-500">
        Возможно, товар закончился или ссылка устарела.
      </p>
      <Link href="/" className="btn-primary mt-6">
        На главную
      </Link>
    </div>
  );
}
