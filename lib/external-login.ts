import "server-only";
import type PocketBase from "pocketbase";
import { createPublicPb, pbAdmin } from "@/lib/pb/server";
import { PB_COOKIE } from "@/lib/pb/shared";
import { generatePassword } from "@/lib/auto-account";
import { joinFullName } from "@/lib/profile";

// Вход по подтверждённой внешним сервисом почте.
//
// Нужен там, где авторизацию выполнил не PocketBase, а мы сами (VK ID — см.
// lib/vkid.ts). К этому моменту почта уже доказана: сервис отдал её нам по
// TLS в ответ на запрос, подписанный нашим секретом.
//
// Аккаунт ищем по почте: у покупателя, который раньше заказывал или
// регистрировался, всё останется на месте — история заказов, ФИО, телефон.
// Нового заводим с длинным случайным паролем: PocketBase требует пароль при
// создании, но знать его никому не нужно — вход идёт через сервис, а если
// пароль понадобится, покупатель задаст свой через «Забыли пароль?».

// Сколько живёт выданная сессия. Столько же, сколько обычная (authToken.duration
// в pocketbase/pb_schema.json) — чтобы вход через сервис не «отваливался»
// раньше входа по паролю.
const SESSION_TTL_SEC = 5 * 24 * 60 * 60;

// Готовая строка Set-Cookie с сессией. Собираем её тем же exportToCookie, что и
// обычный вход: формат должен совпасть до символа — читает cookie
// loadFromCookie в createServerPb.
export function sessionCookie(
  token: string,
  record: unknown,
  secure: boolean
): string {
  const pb = createPublicPb();
  pb.authStore.save(token, record as never);
  return pb.authStore.exportToCookie(
    { httpOnly: true, secure, sameSite: "Lax", path: "/" },
    PB_COOKIE
  );
}

export type ExternalLogin =
  | { ok: true; token: string; record: unknown; created: boolean }
  | { ok: false; error: "noemail" | "failed" };

export async function loginByVerifiedEmail(o: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<ExternalLogin> {
  const email = o.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "noemail" };

  let pb: PocketBase;
  try {
    pb = await pbAdmin();
  } catch (e) {
    console.error("[login] суперпользователь PocketBase недоступен:", e);
    return { ok: false, error: "failed" };
  }

  let userId = "";
  let created = false;
  try {
    const found = await pb.collection("users").getList(1, 1, {
      filter: pb.filter("email = {:e}", { e: email }),
      fields: "id",
    });
    userId = found.items[0]?.id ?? "";
  } catch (e) {
    console.error(`[login] не удалось найти аккаунт ${email}:`, e);
    return { ok: false, error: "failed" };
  }

  if (!userId) {
    const password = generatePassword(24);
    const first_name = (o.firstName ?? "").trim();
    const last_name = (o.lastName ?? "").trim();
    try {
      const rec = await pb.collection("users").create({
        email,
        password,
        passwordConfirm: password,
        name: joinFullName({ last_name, first_name }),
        first_name,
        last_name,
        // Почту подтвердил сервис — второй раз спрашивать код незачем.
        verified: true,
        role: "", // покупатель
      });
      userId = rec.id;
      created = true;
    } catch (e) {
      console.error(`[login] не удалось создать аккаунт ${email}:`, e);
      return { ok: false, error: "failed" };
    }
  }

  // Сессию выпускаем impersonate'ом от суперпользователя: пароля этого
  // покупателя мы не знаем и знать не должны. Токен получается СТАТИЧЕСКИЙ
  // (PocketBase не даёт его обновлять) — именно поэтому проверка сессии в
  // lib/auth.ts не завязана на authRefresh.
  try {
    const impersonated = await pb
      .collection("users")
      .impersonate(userId, SESSION_TTL_SEC);
    return {
      ok: true,
      token: impersonated.authStore.token,
      record: impersonated.authStore.record,
      created,
    };
  } catch (e) {
    console.error(`[login] не удалось выдать сессию для ${email}:`, e);
    return { ok: false, error: "failed" };
  }
}
