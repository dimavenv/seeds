import Image from "next/image";
import Link from "next/link";

export default function SeasonalSaleBanner() {
  return (
    <section aria-labelledby="seasonal-sale-title" className="relative mb-6 overflow-hidden rounded-2xl bg-[#f4efe5] text-[#283c2b] sm:rounded-3xl">
      <div className="grid md:grid-cols-2">
        <div className="relative z-10 flex flex-col items-start px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#6b715e] sm:text-xs">Коллекционные семена · Особые цены</p>
          <h1 id="seasonal-sale-title" className="mt-5 font-serif text-4xl leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">Сезонная<br /><span className="italic">распродажа</span></h1>
          <div className="mt-5 flex items-center gap-4">
            <span className="text-6xl font-semibold leading-none tracking-[-0.07em] text-[#a6422f] sm:text-7xl">−20<span className="text-4xl">%</span></span>
            <span className="border-l border-[#283c2b]/20 pl-4 text-sm leading-relaxed">на семена<br />из нашего каталога</span>
          </div>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-[#606654]">Любимые сорта для будущего урожая.<br />Выбирайте сейчас — выращивайте с любовью.</p>
          <Link href="/catalog" className="mt-6 inline-flex items-center gap-8 rounded-full bg-[#283c2b] px-6 py-3 text-sm font-semibold text-[#fffdf8] transition hover:bg-[#3e5540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#283c2b]">
            Выбрать семена <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="relative min-h-56 sm:min-h-72 md:min-h-full">
          <Image src="/images/seasonal-sale.webp" alt="Красные и золотистые томаты, семена и крафтовый пакет на льняной ткани" fill priority sizes="(max-width: 767px) 100vw, 50vw" className="object-cover object-center" />
          <span className="absolute bottom-5 right-5 rounded-full border border-white/50 bg-[#fffdf8]/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#606654]">От семечка — к урожаю</span>
        </div>
      </div>
    </section>
  );
}
