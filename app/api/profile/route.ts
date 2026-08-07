import { NextResponse } from "next/server";
import { getSessionPb } from "@/lib/auth";
import { EMPTY_PROFILE, profileFromRecord } from "@/lib/profile";

export const dynamic = "force-dynamic";

// Данные покупателя для автозаполнения формы заказа: ФИО, телефон и почта
// аккаунта. Страница оформления — клиентский компонент, поэтому берёт их
// запросом, а не пропсами.
//
// Гостю отдаём пустой профиль со статусом 200: для страницы это не ошибка, а
// обычное «подставлять нечего».
export async function GET() {
  const { session, pb } = await getSessionPb();
  if (!session.userId) {
    return NextResponse.json({ authorized: false, email: null, ...EMPTY_PROFILE });
  }

  let profile = EMPTY_PROFILE;
  try {
    const me = await pb.collection("users").getOne(session.userId);
    profile = profileFromRecord(me as unknown as Record<string, unknown>);
  } catch {
    // База недоступна или в схеме ещё нет полей профиля — подставим только почту.
  }

  return NextResponse.json({
    authorized: true,
    email: session.email,
    ...profile,
  });
}
