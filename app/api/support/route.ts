import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";

// Привязка заявки к аккаунту — «по возможности» (не блокирует отправку).
async function bestEffortUserId(): Promise<string | null> {
  try {
    const authed = createClient();
    const result = await Promise.race([
      authed.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!result) return null;
    return result.data?.user?.id ?? null;
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
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Укажите корректный email для ответа" },
      { status: 400 }
    );
  }

  // Демо-режим без Supabase: заявку сохранить негде — отвечаем как успех.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const isTimeout = (e: unknown) => {
    const t = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`.toLowerCase();
    return t.includes("abort") || t.includes("timeout") || t.includes("fetch failed");
  };

  try {
    const supabase = createServiceClient();
    const userId = await bestEffortUserId();

    const { error } = await supabase.from("support_requests").insert({
      name,
      email,
      subject,
      message,
      status: "new",
      user_id: userId,
    });

    if (error) {
      return NextResponse.json(
        { error: "Не удалось отправить заявку, попробуйте ещё раз" },
        { status: 503 }
      );
    }

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
