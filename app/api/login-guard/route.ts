import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { verifyCaptcha } from "@/lib/captcha";

// Проверка антибот-капчи перед входом. Сам вход выполняет браузер напрямую
// в PocketBase (authWithPassword), поэтому капчу проверяем отдельным запросом:
// клиент сначала зовёт этот роут, и только при успехе делает вход. Токен
// капчи одноразовый — этот запрос его «гасит», бот без решённой капчи токена
// не получит. Пока капча не подключена (нет SMARTCAPTCHA_SERVER_KEY) — роут
// всегда пропускает, вход работает как раньше.
export async function POST(request: Request) {
  let body: { captchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!(await verifyCaptcha(body.captchaToken, ip))) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
