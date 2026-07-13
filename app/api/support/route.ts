import { NextResponse } from "next/server";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured } from "@/lib/pb/shared";
import { encryptField } from "@/lib/crypto";
import { verifyCaptcha } from "@/lib/captcha";

// Привязка заявки к аккаунту — «по возможности» (не блокирует отправку).
async function bestEffortUserId(): Promise<string | null> {
  try {
    const result = await Promise.race([
      getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return result?.userId ?? null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    captchaToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const subject = body.subject?.trim();
  const message = body.message?.trim();

  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { error: "Заполните имя, почту, тему и текст вопроса" },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyCaptcha(body.captchaToken, ip))) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Укажите корректный email для ответа" },
      { status: 400 }
    );
  }

  // Демо-режим без PocketBase: заявку сохранить негде — отвечаем как успех.
  if (!isDbConfigured() || !hasAdminCredentials()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const isTimeout = (e: unknown) => {
    const t = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`.toLowerCase();
    return t.includes("abort") || t.includes("timeout") || t.includes("fetch failed");
  };

  try {
    const pb = await pbAdmin();
    const userId = await bestEffortUserId();

    await pb.collection("support_requests").create({
      name,
      email: encryptField(email),
      subject,
      message: encryptField(message),
      status: "new",
      user: userId ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: isTimeout(e)
          ? "База долго отвечает, попробуйте ещё раз"
          : "Не удалось отправить заявку",
      },
      { status: 503 }
    );
  }
}
