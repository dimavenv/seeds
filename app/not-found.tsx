import Link from "next/link";
import { TomatoIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="bg-brand-50">
      <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
        {/* Большое 4🍅4 */}
        <div className="flex select-none items-center justify-center gap-2 sm:gap-4">
          <span className="text-[7rem] font-black leading-none text-brand-700 sm:text-[11rem]">
            4
          </span>
          <TomatoIcon className="h-28 w-28 drop-shadow-sm sm:h-44 sm:w-44" />
          <span className="text-[7rem] font-black leading-none text-brand-700 sm:text-[11rem]">
            4
          </span>
        </div>

        <h1 className="mt-2 max-w-xl text-2xl font-extrabold uppercase tracking-tight text-brand-800 sm:text-3xl">
          Возможно, это не то, что вы искали
        </h1>
        <p className="mt-3 max-w-md text-brand-700">
          Похоже, эта грядка опустела: товар закончился или ссылка устарела.
          Загляните в каталог — там много семян для богатого урожая.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="btn-primary">
            На главную
          </Link>
          <Link href="/catalog" className="btn-outline">
            В каталог семян
          </Link>
        </div>
      </div>
    </div>
  );
}
