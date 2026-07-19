import { NextResponse } from "next/server";
import { pbAdmin } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: {
    author_name?: string;
    rating?: number;
    text?: string;
    source?: string;
    created_at?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const author_name = body.author_name?.trim();
  const text = body.text?.trim();
  const rating = Number(body.rating);
  const source = body.source?.trim() || "";
  // Дата отзыва (для перенесённых с Ozon и т.п.) — хранится в published_at.
  const publishedAt = body.created_at ? new Date(body.created_at) : new Date();

  if (!author_name || !text || !rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "Заполните имя, текст и рейтинг (1–5)" },
      { status: 400 }
    );
  }
  if (Number.isNaN(publishedAt.getTime())) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }

  try {
    const pb = await pbAdmin();
    const rec = await pb.collection("reviews").create({
      author_name,
      text,
      rating,
      source,
      status: "approved",
      published_at: publishedAt.toISOString(),
    });
    return NextResponse.json({ ok: true, id: rec.id });
  } catch {
    return NextResponse.json(
      { error: "Не удалось сохранить отзыв" },
      { status: 503 }
    );
  }
}
