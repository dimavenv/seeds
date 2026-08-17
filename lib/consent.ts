import "server-only";
import { headers } from "next/headers";
import type PocketBase from "pocketbase";
import { clientIpFromHeaders } from "@/lib/client-ip";

// Учёт согласия на обработку персональных данных (152-ФЗ).
//
// Галочка на форме — это ещё не согласие: доказать через полгода, что человек
// её ставил, нечем. Закон ждёт, что оператор может показать факт согласия, его
// дату и то, с КАКОЙ редакцией политики человек соглашался. Поэтому каждое
// согласие пишется отдельной записью: адрес, назначение, версия политики,
// время, IP и браузер.
//
// Сама галочка при этом обязана быть снятой по умолчанию и проверяться на
// сервере — иначе её легко «не заметить» в клиенте (см. /api/checkout,
// /api/support, /api/register).

// Версия политики. Меняется ВМЕСТЕ с текстом на /privacy — по ней потом видно,
// на что именно соглашался покупатель. Формат — дата редакции.
export const PRIVACY_POLICY_VERSION = "2026-08-05";

// Для чего собрано согласие. Пригодится при запросе на удаление данных:
// видно, где именно человек оставил след.
export type ConsentPurpose = "order" | "support" | "register";

export function hasConsent(value: unknown): boolean {
  // Принимаем только явное «да». Отсутствие поля — это отсутствие согласия,
  // а не «наверное, согласился».
  return value === true || value === "true" || value === "on" || value === 1;
}

export const CONSENT_REQUIRED_MESSAGE =
  "Подтвердите согласие на обработку персональных данных";

// Запись согласия. Никогда не бросает: отказать покупателю в заказе из-за
// сбоя журнала было бы хуже, чем потерять одну строку — но сбой обязан быть
// виден в логе.
export async function recordConsent(
  pb: PocketBase,
  o: {
    email?: string | null;
    purpose: ConsentPurpose;
    userId?: string | null;
    // К чему относится: номер заказа, id заявки. Помогает связать согласие с
    // конкретным следом в базе.
    reference?: string | null;
  }
): Promise<void> {
  try {
    let ip = "";
    let userAgent = "";
    try {
      const h = headers();
      ip = clientIpFromHeaders(h) ?? "";
      userAgent = h.get("user-agent") ?? "";
    } catch {
      // Вне контекста запроса — пишем без технических деталей.
    }
    await pb.collection("consents").create({
      // Адрес — единственное, по чему согласие потом находят. Храним как есть:
      // зашифрованное значение сделало бы журнал бесполезным для поиска, а
      // сама по себе строка «согласие такого-то адреса» — это и есть то, что
      // оператор обязан уметь предъявить.
      email: (o.email ?? "").trim().toLowerCase().slice(0, 255),
      purpose: o.purpose,
      policy_version: PRIVACY_POLICY_VERSION,
      ip: ip.slice(0, 60),
      user_agent: userAgent.slice(0, 300),
      user: o.userId ?? "",
      reference: (o.reference ?? "").slice(0, 120),
    });
  } catch (e) {
    console.error(`[consent] не удалось записать согласие (${o.purpose}):`, e);
  }
}
