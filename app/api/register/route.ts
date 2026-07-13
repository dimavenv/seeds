import { NextResponse } from "next/server";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { isDbConfigured } from "@/lib/pb/shared";
import { isRussianEmail, RU_EMAIL_HINT } from "@/lib/ru-email";
import { verifyCaptcha } from "@/lib/captcha";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Регистрация покупателя — только через этот роут (в PocketBase прямое создание
// users закрыто). Здесь: проверка российской почты, антибот-капча, создание
// аккаунта суперпользователем (без возможности задать роль admin).
export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string; captchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return bad("Некорректный запрос");
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 100);

  if (!email || !password) return bad("Заполните email и пароль");
  if (password.length < 6) return bad("Пароль минимум 6 символов");
  if (!isRussianEmail(email)) return bad(RU_EMAIL_HINT);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const human = await verifyCaptcha(body.captchaToken, ip);
  if (!human) return bad("Подтвердите, что вы не робот");

  if (!isDbConfigured() || !hasAdminCredentials()) {
    return bad("Регистрация временно недоступна", 503);
  }

  try {
    const pb = await pbAdmin();
    await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name,
      role: "", // покупатель; роль admin через регистрацию задать нельзя
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
    if (data && "email" in data) return bad("Такой email уже зарегистрирован");
    if (data && "password" in data) return bad("Пароль слишком простой");
    return bad("Не удалось зарегистрироваться, попробуйте ещё раз", 503);
  }
}
