import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { isRussianEmail, RU_EMAIL_HINT } from "@/lib/ru-email";
import { sendMail, mailLayout, escapeHtml } from "@/lib/email";

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
  if (!email || !password) error = "Заполните email и пароль";
  else if (password.length < 6) error = "Пароль минимум 6 символов";
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
      <p style="margin:0;color:#5c6b5c;font-size:13px;">Код действует 15 минут.
      Если вы не регистрировались — просто проигнорируйте это письмо, аккаунт
      создан не будет.</p>
    `)
  );
}
