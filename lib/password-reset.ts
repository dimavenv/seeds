import "server-only";
import { pbAdmin } from "@/lib/pb/server";
import { sendMail, mailLayout, escapeHtml } from "@/lib/email";
import { ttlMs } from "@/lib/email-code";

// Сброс пароля кодом из письма.
//
// Почему не встроенный сброс PocketBase: он шлёт письмо СВОИМ почтовиком (его
// настройки отдельные от сайта и обычно пустые), а ссылка в письме ведёт в
// админку PocketBase — покупателю там делать нечего. Поэтому сброс сделан так
// же, как подтверждение почты при регистрации: 6-значный код письмом с ящика
// магазина, билет с кодом на руках у клиента (lib/email-code.ts), новый пароль
// ставит суперпользователь.

// Есть ли аккаунт с такой почтой. НАРУЖУ этот ответ не показываем: страница
// сброса отвечает одинаково для любой почты, иначе по ней можно было бы
// перебирать зарегистрированных покупателей.
export async function accountExists(email: string): Promise<boolean> {
  const pb = await pbAdmin();
  const page = await pb
    .collection("users")
    .getList(1, 1, {
      filter: pb.filter("email = {:e}", { e: email }),
      fields: "id",
    });
  return page.items.length > 0;
}

// Новый пароль. Ставит суперпользователь — старый пароль покупатель как раз и
// не помнит, а право на смену доказано кодом из письма.
export async function applyNewPassword(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  try {
    const pb = await pbAdmin();
    const page = await pb
      .collection("users")
      .getList(1, 1, {
        filter: pb.filter("email = {:e}", { e: email }),
        fields: "id",
      });
    const user = page.items[0];
    if (!user) {
      // Аккаунт исчез между запросом кода и подтверждением.
      return { ok: false, error: "Аккаунт не найден", status: 404 };
    }
    await pb.collection("users").update(user.id, {
      password,
      passwordConfirm: password,
      // Пароль теперь свой, а не присланный сайтом после оплаты.
      auto_password: false,
    });
    return { ok: true };
  } catch (e) {
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (data && "password" in data) {
      return { ok: false, error: "Пароль слишком простой", status: 400 };
    }
    return {
      ok: false,
      error: "Не удалось сменить пароль, попробуйте ещё раз",
      status: 503,
    };
  }
}

// Письмо с кодом сброса.
export async function sendResetEmail(
  email: string,
  code: string
): Promise<boolean> {
  return sendMail(
    email,
    `Код для смены пароля: ${code} — Томат Семена`,
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Смена пароля</h1>
      <p style="margin:0 0 18px;">Кто-то (надеемся, что вы) запросил смену
      пароля для аккаунта <b>${escapeHtml(email)}</b> на tomatsemena.ru.
      Введите этот код на странице сброса пароля:</p>
      <div style="margin:0 0 18px;padding:16px;background:#f1f7f1;border-radius:12px;text-align:center;">
        <span style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1d4220;">${code}</span>
      </div>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Код действует
      ${Math.round(ttlMs() / 60000)} мин. с момента отправки письма. Если вы
      ничего не запрашивали — просто проигнорируйте это письмо: пароль
      останется прежним, менять его не нужно.</p>
    `)
  );
}

// Письмо «пароль изменён» — уже после смены. Нужно, чтобы владелец аккаунта
// узнал о смене, даже если её сделал не он.
export async function sendPasswordChangedEmail(email: string): Promise<boolean> {
  return sendMail(
    email,
    "Пароль изменён — Томат Семена",
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Пароль изменён</h1>
      <p style="margin:0 0 14px;">Пароль от аккаунта <b>${escapeHtml(email)}</b>
      на tomatsemena.ru только что изменён. Если это были вы — всё в порядке,
      просто войдите с новым паролем.</p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Если это были не вы —
      напишите нам на
      <a href="mailto:info@tomatsemena.ru" style="color:#2e7d32;">info@tomatsemena.ru</a>,
      разберёмся.</p>
    `)
  );
}
