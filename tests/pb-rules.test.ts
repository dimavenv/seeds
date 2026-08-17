import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Правила доступа PocketBase — это и есть настоящая авторизация: база открыта
// браузеру (nginx отдаёт её по /pb/), и код на React границей безопасности не
// является. Схему импортируют скриптом (npm run db:schema), и одна съехавшая
// строка в pb_schema.json молча открывает коллекцию всему интернету.
// Поэтому важные правила проверяем тестом.

type Collection = {
  name: string;
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
};

const schema: Collection[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "pocketbase", "pb_schema.json"), "utf8")
);

function collection(name: string): Collection {
  const found = schema.find((c) => c.name === name);
  expect(found, `в схеме нет коллекции ${name}`).toBeDefined();
  return found!;
}

// Пустая строка в PocketBase значит «можно всем, включая анонимных».
const OPEN_TO_EVERYONE = "";

describe("правила доступа PocketBase", () => {
  it("покупатель не может выдать себе права администратора", () => {
    const rule = collection("users").updateRule ?? "";
    expect(rule).toContain("@request.body.role:isset = false");
  });

  it("заблокированный покупатель не может разблокировать себя", () => {
    // Блокировку ставит продавец из админки, а проверяется она на каждом
    // запросе по свежей записи (lib/auth.ts). Если правило разрешает
    // самообновление любых полей кроме role, владелец токена просто снимет
    // себе blocked запросом прямо в базу — и блокировка ничего не значит.
    const rule = collection("users").updateRule ?? "";
    expect(rule).toContain("@request.body.blocked:isset = false");
    expect(rule).toContain("@request.body.blocked_reason:isset = false");
  });

  it("заказы и их состав видны только владельцу и администратору", () => {
    for (const name of ["orders", "order_items"]) {
      const c = collection(name);
      for (const rule of [c.listRule, c.viewRule]) {
        expect(rule, `${name}: чтение открыто всем`).not.toBe(OPEN_TO_EVERYONE);
        expect(rule).toContain("@request.auth");
      }
      // Заказы создаёт только сервер (суперпользователем, после проверки цен
      // и остатков), менять их может только администратор.
      expect(c.createRule, `${name}: создание должно быть закрыто`).toBeNull();
      expect(c.updateRule).toBe('@request.auth.role = "admin"');
      expect(c.deleteRule).toBe('@request.auth.role = "admin"');
    }
  });

  it("чужие отзывы видны только после модерации", () => {
    const c = collection("reviews");
    for (const rule of [c.listRule, c.viewRule]) {
      expect(rule).toContain('status = "approved"');
      expect(rule).not.toBe(OPEN_TO_EVERYONE);
    }
    // Отзыв создаёт сервер и только со статусом pending (app/account/actions).
    expect(c.createRule).toBeNull();
  });

  it("обращения в поддержку и промокоды закрыты от покупателей", () => {
    for (const name of ["support_requests", "promos"]) {
      const c = collection(name);
      expect(c.listRule).toBe('@request.auth.role = "admin"');
      expect(c.viewRule).toBe('@request.auth.role = "admin"');
    }
    // Заявку создаёт сервер после капчи; промокод — только администратор.
    expect(collection("support_requests").createRule).toBeNull();
    expect(collection("promos").createRule).toBe('@request.auth.role = "admin"');
  });

  it("корзина аккаунта доступна только своему хозяину", () => {
    const c = collection("user_store");
    for (const rule of [c.listRule, c.viewRule, c.createRule, c.updateRule, c.deleteRule]) {
      expect(rule).toContain("user = @request.auth.id");
    }
  });

  it("каталог доступен на чтение всем, а менять его может только администратор", () => {
    for (const name of ["products", "categories", "media"]) {
      const c = collection(name);
      expect(c.listRule).toBe(OPEN_TO_EVERYONE);
      expect(c.viewRule).toBe(OPEN_TO_EVERYONE);
      for (const rule of [c.createRule, c.updateRule, c.deleteRule]) {
        expect(rule).toBe('@request.auth.role = "admin"');
      }
    }
  });

  it("в аватары нельзя загрузить SVG", () => {
    // SVG — это документ со скриптами внутри, а файлы отдаются с того же
    // origin, что и API базы.
    const users = schema.find((c) => c.name === "users") as unknown as {
      fields: { name: string; mimeTypes?: string[] }[];
    };
    const avatar = users.fields.find((f) => f.name === "avatar");
    expect(avatar?.mimeTypes ?? []).not.toContain("image/svg+xml");
  });
});
