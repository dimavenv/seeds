"use client";

import PocketBase from "pocketbase";
import { PB_COOKIE } from "@/lib/pb/shared";

// Единый браузерный клиент PocketBase. Сессия хранится в localStorage (SDK)
// и зеркалируется в cookie pb_auth — её читает сервер (SSR/actions).
let instance: PocketBase | null = null;

export function getPb(): PocketBase {
  if (instance) return instance;
  instance = new PocketBase(process.env.NEXT_PUBLIC_PB_URL ?? "");
  instance.autoCancellation(false);

  const syncCookie = () => {
    if (typeof document === "undefined") return;
    document.cookie = instance!.authStore.exportToCookie(
      {
        httpOnly: false,
        secure: window.location.protocol === "https:",
        sameSite: "Lax",
        path: "/",
      },
      PB_COOKIE
    );
  };
  instance.authStore.onChange(syncCookie);
  syncCookie();
  return instance;
}

// Полный выход: чистим сессию SDK и cookie.
export function clearAuth(): void {
  const pb = getPb();
  pb.authStore.clear();
  if (typeof document !== "undefined") {
    document.cookie = `${PB_COOKIE}=; Max-Age=0; path=/`;
  }
}
