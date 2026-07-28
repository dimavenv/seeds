// Просит сайт пересобрать карту сайта и списки товаров.
//
// Скрипты из scripts/ меняют базу напрямую, минуя Next, поэтому его кэш об
// этом не узнаёт: sitemap.xml и каталог отдавали бы старые данные ещё до часа.
// Этот вызов сбрасывает кэш сразу после массовой правки.
//
// Работает, только если заданы:
//   CRON_SECRET  — тот же секрет, что у плановой уборки заказов
//   SITE_URL или NEXT_PUBLIC_SITE_URL — адрес сайта (по умолчанию localhost:3000)
// Без секрета просто печатает подсказку и ничего не делает: это удобство, а не
// обязательный шаг, и падать из-за него скрипт не должен.
export async function revalidateSite() {
  const secret = process.env.CRON_SECRET;
  const base = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");

  if (!secret) {
    console.log(
      "\nКэш сайта не сброшен: не задан CRON_SECRET.\n" +
        "Карта сайта обновится сама в течение часа. Чтобы сразу — задайте\n" +
        "CRON_SECRET в .env.production и запустите скрипт ещё раз."
    );
    return false;
  }

  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      console.log(`\nКэш сайта сброшен: ${base}/sitemap.xml пересоберётся сейчас.`);
      return true;
    }
    console.warn(
      `\nНе удалось сбросить кэш (${res.status}). Карта сайта обновится сама ` +
        `в течение часа.`
    );
  } catch (e) {
    console.warn(
      `\nНе удалось достучаться до ${base}/api/revalidate (${e.message}). ` +
        `Карта сайта обновится сама в течение часа.`
    );
  }
  return false;
}
