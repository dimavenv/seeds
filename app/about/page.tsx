import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getProducts } from "@/lib/data";

export const metadata: Metadata = { title: "О нас — Tomat Semena" };
export const revalidate = 300;

const FACTS: { icon: string; title: string; text: string }[] = [
  {
    icon: "💪",
    title: "Мощный природный иммунитет",
    text: "Семена созревают в естественных южных условиях. Только кубанское тепло, природная почва и заботливый ручной уход. Благодаря этому растения получают сильный жизненный заряд и отлично адаптируются при переезде в любой другой регион.",
  },
  {
    icon: "🧬",
    title: "Сортовая независимость",
    text: "Я принципиально не выращиваю гибриды. В моём каталоге — только чистые коллекционные сорта. Полюбившийся вкус останется с вами навсегда: вы сможете сами собирать семена с выращенных плодов и вести свою фамильную летопись урожаев, а ко мне заглядывать за свежими мировыми новинками.",
  },
  {
    icon: "❤️",
    title: "Проверено на себе",
    text: "Я лично прохожу с каждым сортом полный путь — от маленького хрупкого росточка до дегустации спелого плода. В каталог попадает только то, что восхитило меня вкусом, урожайностью и заставило моё сердце биться чаще.",
  },
  {
    icon: "✍️",
    title: "Личный знак качества",
    text: "Здесь нет места массовому автоматизированному производству — за каждым пакетиком семян стою лично я. Каждая семечка проходит строгий ручной отбор, правильную сушку и бережное хранение. Я отправляю только тот материал, в чьей чистоте и всхожести уверена на все 100%.",
  },
];

export default async function AboutPage() {
  // Несколько случайных томатов из каталога — для живой галереи.
  const tomatoes = (await getProducts({ categorySlug: "tomaty", limit: 40 }))
    .filter((p) => p.image_url)
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-5xl">
        {/* Герой: 4 фото (2×2) слева + приветствие справа */}
        <section className="grid items-center gap-8 lg:grid-cols-2">
          {tomatoes.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {tomatoes.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  title={p.name}
                  style={{ animationDelay: `${i * 90}ms` }}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-brand-50 shadow-sm motion-safe:animate-pop-in"
                >
                  <Image
                    src={p.image_url!}
                    alt={p.name}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </Link>
              ))}
            </div>
          )}

          <div className="motion-safe:animate-fade-up">
            <span className="mb-3 block text-4xl font-black text-accent-500 sm:text-5xl">
              О нас
            </span>
            <h1 className="text-lg font-extrabold leading-snug text-brand-800 sm:text-xl">
              Добро пожаловать в интернет-магазин{" "}
              <span className="whitespace-nowrap">
                Tomat<span className="text-accent-500">Semena</span>
              </span>
              , где семена — это не просто будущие грядки, а начало
              захватывающего эстетического приключения!
            </h1>
            <div className="mt-3 h-1 w-16 rounded-full bg-accent-500" />
          </div>
        </section>

        <div className="mt-10 space-y-4 text-lg leading-relaxed text-brand-700 motion-safe:animate-fade-up">
          <p>
            Меня зовут <strong>Вера</strong>. Мой вдохновляющий приусадебный
            участок находится в самом благодатном и тёплом уголке страны — в
            Краснодарском крае.
          </p>
          <p>
            Пока в других регионах коллекционеры борются со сложным климатом и
            капризами природы, здесь, на Юге, я отдаю свои растения во власть
            щедрого солнца. Я не просто продаю семена — я собираю живые истории.
          </p>
          <p>
            Я специализируюсь на старинных фамильных реликвиях со всего мира, а
            также на самых безумных новинках селекции. Если вы хотите, чтобы
            соседи замирали от удивления у вашего забора, — вы пришли по адресу!
            Моя страсть — это томаты самых неожиданных форм и оттенков,
            коллекционные декоративные перцы и баклажаны, сочные дыни и арбузы, а
            также необычный взрывной попкорн.
          </p>
        </div>

        <h2 className="mt-12 text-2xl font-extrabold text-brand-800">
          Главные факты о моих семенах
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {FACTS.map((f, i) => (
            <div
              key={f.title}
              style={{ animationDelay: `${i * 80}ms` }}
              className="card p-5 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-safe:animate-fade-up"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <h3 className="font-bold text-brand-800">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand-600">
                    {f.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-brand-50 p-6 text-center">
          <p className="text-lg font-semibold text-brand-800">
            Выбирайте с удовольствием, создавайте огород своей мечты, а если
            возникнут вопросы — я всегда на связи и готова помочь советом!
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/catalog/tomaty" className="btn-primary">
              Смотреть томаты
            </Link>
            <Link href="/support" className="btn-outline">
              Задать вопрос
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
