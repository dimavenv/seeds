"use client";

import PocketBase from "pocketbase";
import { markPendingMerge } from "@/lib/cart-sync";
import { writeStoredPromo } from "@/lib/promo";
import { secureClear, CHECKOUT_PROFILE_KEY } from "@/lib/secure-store";

// Единый браузерный клиент PocketBase.
//
// Сессионную cookie pb_auth теперь ставит СЕРВЕР (httpOnly, недоступна из JS —
// аудит 4.2, см. /api/auth/login и /api/auth/logout). Клиентский SDK держит
// токен только в своём сторе (localStorage) для СОБСТВЕННЫХ запросов (корзина,
// загрузка фото) — они уходят с заголовком Authorization, а не через cookie.
// Поэтому здесь cookie больше НЕ пишем (иначе появлялась бы вторая, читаемая
// из JS копия сессии).
let instance: PocketBase | null = null;

export function getPb(): PocketBase {
  if (instance) return instance;
  instance = new PocketBase(process.env.NEXT_PUBLIC_PB_URL ?? "");
  instance.autoCancellation(false);
  return instance;
}

export type ServerLoginResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; error: string; status: number };

// Вход через серверный роут: пароль проверяется на сервере, httpOnly-cookie
// ставится там же. В ответе приходит токен — заполняем им клиентский SDK, чтобы
// его собственные запросы (корзина/избранное) продолжали работать.
export async function serverLogin(payload: {
  email: string;
  password: string;
  captchaToken?: string;
}): Promise<ServerLoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Не удалось подключиться к серверу", status: 0 };
  }
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    record?: unknown;
    isAdmin?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "Не удалось войти",
      status: res.status,
    };
  }
  if (data.token) getPb().authStore.save(data.token, data.record as never);
  // Отмечаем вход: после перезагрузки страницы провайдер корзины ОБЯЗАН слить
  // гостевую корзину с корзиной аккаунта, а не доверяться серверной (метка
  // SYNC_KEY могла остаться от прошлой сессии в этом браузере). См. lib/cart-sync.
  markPendingMerge();
  return { ok: true, isAdmin: Boolean(data.isAdmin) };
}

// Полный выход: гасим серверную httpOnly-cookie и чистим клиентский SDK-стор.
export async function clearAuth(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // сеть недоступна — cookie истечёт сама; локально всё равно выходим
  }
  getPb().authStore.clear();
  // Промокод привязан к аккаунту, а localStorage — к устройству: после выхода
  // он не должен «висеть» у следующего вошедшего в этом браузере. Сервер такой
  // код всё равно не примет, но и показывать чужую скидку незачем.
  writeStoredPromo(null);
  // По той же причине стираем сохранённые «Запомнить меня» данные получателя:
  // ФИО, телефон и адрес не должны подставляться следующему человеку за этим
  // же компьютером (аудит 5.3).
  secureClear(CHECKOUT_PROFILE_KEY);
}
