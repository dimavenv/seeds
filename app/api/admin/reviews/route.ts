import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
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
  const source = body.source?.trim() || null;
  const created_at = body.created_at || undefined;

  if (!author_name || !text || !rating || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "Заполните имя, текст и рейтинг (1–5)" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      author_name,
      text,
      rating,
      source,
      status: "approved",
      ...(created_at ? { created_at } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Не удалось сохранить отзыв" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
