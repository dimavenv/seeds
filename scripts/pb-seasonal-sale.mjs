// One-time campaign: preserve selling prices and set the reference discount.
// The completion flag prevents later deploys from overwriting admin changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of fs.readFileSync(path.join(root, ".env.production"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
  console.error("Нужны PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD в .env.production или окружении.");
  process.exit(1);
}
const pb = new PocketBase(process.env.PB_URL || process.env.PB_INTERNAL_URL || "http://127.0.0.1:8090");
try {
  await pb.collection("_superusers").authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
  const settings = (await pb.collection("site_settings").getList(1, 1)).items[0];
  if (settings?.seasonal_sale_202610_applied) {
    console.log("Сезонная скидка уже применена; последующие правки администратора сохранены.");
  } else {
    const collection = await pb.collections.getOne("products");
    const settingsCollection = await pb.collections.getOne("site_settings");
    if (!collection.fields.some(f => f.name === "discount_percent") ||
        !settingsCollection.fields.some(f => f.name === "seasonal_sale_202610_applied")) {
      throw new Error("Сначала выполните npm run db:schema.");
    }
    const products = await pb.collection("products").getFullList({ fields: "id,price,discount_percent" });
    if (products.length === 0) throw new Error("Каталог пуст: акция не отмечена как применённая.");
    let updated = 0;
    for (const product of products) {
      if (product.discount_percent === 20) continue;
      const saved = await pb.collection("products").update(product.id, { discount_percent: 20 });
      if (saved.discount_percent !== 20 || saved.price !== product.price) {
        throw new Error(`Не удалось подтвердить скидку или сохранение цены товара ${product.id}`);
      }
      updated++;
    }
    const verified = await pb.collection("products").getFullList({ fields: "id,price,discount_percent" });
    if (verified.length !== products.length || verified.some(p => p.discount_percent !== 20)) {
      throw new Error("Каталог изменился во время обновления. Повторите команду.");
    }
    const flag = { seasonal_sale_202610_applied: true };
    if (settings) await pb.collection("site_settings").update(settings.id, flag);
    else await pb.collection("site_settings").create(flag);
    console.log(`Скидка 20% проверена у ${verified.length} товаров; обновлено ${updated}. Цены продажи сохранены.`);
  }
} catch (error) {
  // Do not print SDK request objects: they can contain authentication details.
  console.error(`Не удалось применить акцию: ${error.message}`);
  process.exitCode = 1;
} finally {
  pb.authStore.clear();
}
