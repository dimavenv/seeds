import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { isRussianEmail, RU_EMAIL_HINT } from "@/lib/ru-email";
import { sendMail, mailLayout, escapeHtml } from "@/lib/email";
import { ttlMs } from "@/lib/email-code";

// Общая логика регистрации для роутов /api/register/*.

export type RegInput = { email: string; password: string; name: string };

// Нормализация и валидация полей. Возвращает текст ошибки или null.
export function parseRegInput(body: Record<string, unknown>): {
  input: RegInput;
  error: string | null;
} {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 100);

  let error: string | null = null;
  // Минимум 8 символов — как в схеме PocketBase (поле password, min 8).
  // При меньшем лимите пользователь проходил капчу и код из письма, а падал
  // только на создании аккаунта с невнятной ошибкой.
  if (!email || !password) error = "Заполните email и пароль";
  else if (password.length < 8) error = "Пароль минимум 8 символов";
  else if (!isRussianEmail(email)) error = RU_EMAIL_HINT;

  return { input: { email, password, name }, error };
}

export function dbReady(): boolean {
  return isDbConfigured() && hasAdminCredentials();
}

// Занят ли email (проверка суперпользователем, обычным пользователям listing закрыт).
export async function emailTaken(email: string): Promise<boolean> {
  const pb = await pbAdmin();
  const page = await pb
    .collection("users")
    .getList(1, 1, { filter: pb.filter("email = {:e}", { e: email }), fields: "id" });
  return page.items.length > 0;
}

// Создание покупателя. verified = true после подтверждения кодом.
// Ошибки PocketBase переводим в человеческий текст.
export async function createUser(
  input: RegInput,
  verified: boolean
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  try {
    const pb = await pbAdmin();
    await pb.collection("users").create({
      email: input.email,
      password: input.password,
      passwordConfirm: input.password,
      name: input.name,
      verified,
      role: "", // покупатель; роль admin через регистрацию задать нельзя
    });
    return { ok: true };
  } catch (e) {
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (data && "email" in data) {
      return { ok: false, error: "Такой email уже зарегистрирован", status: 400 };
    }
    if (data && "password" in data) {
      return { ok: false, error: "Пароль слишком простой", status: 400 };
    }
    return {
      ok: false,
      error: "Не удалось зарегистрироваться, попробуйте ещё раз",
      status: 503,
    };
  }
}

// Письмо с кодом подтверждения.
export async function sendCodeEmail(
  email: string,
  name: string,
  code: string
): Promise<boolean> {
  const hello = name ? `${escapeHtml(name)}, здравствуйте!` : "Здравствуйте!";
  return sendMail(
    email,
    `Код подтверждения: ${code} — Томат Семена`,
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">Подтвердите почту</h1>
      <p style="margin:0 0 18px;">${hello} Ваш код для завершения регистрации
      на <b>tomatsemena.ru</b>:</p>
      <div style="margin:0 0 18px;padding:16px;background:#f1f7f1;border-radius:12px;text-align:center;">
        <span style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1d4220;">${code}</span>
      </div>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Код действует
      ${Math.round(ttlMs() / 60000)} мин. с момента отправки письма.
      Если вы не регистрировались — просто проигнорируйте это письмо, аккаунт
      создан не будет.</p>
    `)
  );
}

// Письмо на уже зарегистрированную почту. Отправляется вместо кода, когда
// кто-то пытается зарегистрироваться на существующий адрес: HTTP-ответ при этом
// НЕ отличается от обычной регистрации (см. /api/register), поэтому по ответу
// нельзя узнать, есть ли аккаунт (защита от перечисления адресов, аудит 4.4).
// Легитимному владельцу письмо подсказывает войти или восстановить пароль.
export async function sendExistsEmail(
  email: string,
  name: string
): Promise<boolean> {
  const hello = name ? `${escapeHtml(name)}, здравствуйте!` : "Здравствуйте!";
  return sendMail(
    email,
    `Вход в аккаунт — Томат Семена`,
    mailLayout(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1d4220;">У вас уже есть аккаунт</h1>
      <p style="margin:0 0 14px;">${hello} На этот адрес уже зарегистрирован
      аккаунт на <b>tomatsemena.ru</b>, поэтому код для новой регистрации мы не
      отправляли.</p>
      <p style="margin:0 0 14px;">Если это вы — просто
      <a href="https://tomatsemena.ru/login" style="color:#2e7d32;font-weight:bold;">войдите</a>.
      Забыли пароль —
      <a href="https://tomatsemena.ru/password-reset" style="color:#2e7d32;font-weight:bold;">смените его</a>:
      пришлём код на этот же адрес.</p>
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Если вы не пытались
      зарегистрироваться или войти — просто проигнорируйте это письмо, с
      аккаунтом ничего не произошло.</p>
    `)
  );
}
