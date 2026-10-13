import Image from "next/image";
import Link from "next/link";

export default function SeasonalSaleBanner({ active = true }: { active?: boolean }) {
  return (
    <div className="relative grid h-full grid-cols-[58%_42%] overflow-hidden bg-[#f4efe5] text-[#283c2b] sm:grid-cols-2">
      <div className="relative z-10 flex flex-col items-start justify-center py-3 pl-4 pr-1 pb-7 sm:px-8 sm:pb-9 lg:px-12">
        <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b715e] sm:block">Коллекционные семена · Особые цены</p>
        <h2 className="font-serif text-[clamp(1.15rem,4vw,3.75rem)] leading-[1.05] tracking-tight sm:mt-4">Сезонная<br /><span className="italic">распродажа</span></h2>
        <div className="mt-2 flex items-center gap-2 sm:mt-4 sm:gap-4">
          <span className="text-[clamp(2rem,6vw,4.5rem)] font-semibold leading-none tracking-[-0.07em] text-[#a6422f]">−20<span className="text-[0.6em]">%</span></span>
          <span className="border-l border-[#283c2b]/20 pl-2 text-[10px] leading-snug sm:pl-4 sm:text-sm">на семена<br />из каталога</span>
        </div>
        <p className="mt-4 hidden max-w-xs text-sm leading-relaxed text-[#606654] lg:block">Любимые сорта для будущего урожая.</p>
        <Link href="/catalog" tabIndex={active ? undefined : -1} className="mt-3 inline-flex items-center gap-3 rounded-full bg-[#283c2b] px-3 py-2 text-[10px] font-semibold text-[#fffdf8] transition hover:bg-[#3e5540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#283c2b] sm:mt-5 sm:gap-8 sm:px-6 sm:py-3 sm:text-sm">
          Выбрать семена <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="relative min-w-0">
        <Image src="/images/seasonal-sale.webp" alt="Красные и золотистые томаты, семена и крафтовый пакет на льняной ткани" fill priority sizes="(max-width: 767px) 42vw, 50vw" className="object-cover object-center" />
      </div>
    </div>
  );
}
