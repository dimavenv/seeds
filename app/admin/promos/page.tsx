import { createServerPb } from "@/lib/pb/server";
import { envPromo, listPromos, promoUsage, type PromoRecord } from "@/lib/promo-server";
import PromosTable from "@/components/admin/promos-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Промокоды" };

export default async function AdminPromos() {
  const pb = createServerPb();

  let promos: PromoRecord[] = [];
  let dbError: string | null = null;
  try {
    promos = await listPromos(pb);
  } catch (e) {
    // Коллекции ещё нет — схему в PocketBase не импортировали после
    // обновления. Это единственная ожидаемая причина, поэтому и подсказка
    // конкретная, а не «что-то пошло не так».
    console.error("[admin] промокоды не прочитались:", e);
    dbError =
      "Не удалось прочитать промокоды. Если магазин только что обновлён — импортируйте схему базы: npm run db:schema";
  }

  // Пока в базе нет ни одного кода, продолжает действовать код из переменных
  // окружения. Показываем его в списке — иначе продавец видит пустую страницу
  // при работающей на сайте скидке.
  const fallback = promos.length === 0 ? envPromo() : null;
  const usage = await promoUsage(pb);

  return (
    <div className="space-y-4">
      {dbError && (
        <div className="card p-5">
          <p className="text-sm text-accent-600">{dbError}</p>
        </div>
      )}

      <PromosTable
        promos={fallback ? [fallback] : promos}
        usage={Object.fromEntries(usage)}
      />

      <div className="card p-5 text-sm text-brand-600">
        <h2 className="font-bold text-brand-800">Как это работает</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Покупатель вводит код в корзине. Регистр, пробелы и дефисы неважны,
            похожие латинские буквы («УPOЖAЙ») тоже засчитываются.
          </li>
          <li>
            Скидка считается на сервере от цен в базе — подменить её в браузере
            нельзя.
          </li>
          <li>
            Код «один раз на аккаунт» защищён от гонки на уровне базы: два
            одновременных заказа не пройдут оба.
          </li>
          <li>
            Общий лимит применений считается по заказам, кроме отменённых:
            отменили заказ — применение вернулось.
          </li>
          <li>
            Выключенный, ещё не начавшийся и истёкший код покупатель не отличит
            от несуществующего — так коды не подбирают перебором.
          </li>
        </ul>
      </div>
    </div>
  );
}
