import { NextResponse } from "next/server";
import { listOAuthProviders } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// Какие внешние входы доступны — по этому списку страницы входа и регистрации
// решают, показывать ли кнопку «Войти через Яндекс ID». Спрашиваем сервер, а не
// держим отдельную переменную окружения: включение провайдера живёт в настройках
// PocketBase, и две копии этого знания рано или поздно разъехались бы.
export async function GET() {
  const providers = await listOAuthProviders();
  return NextResponse.json({
    providers: providers.map((p) => ({ name: p.name, title: p.title })),
  });
}
