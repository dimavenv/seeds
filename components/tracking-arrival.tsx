"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function TrackingArrival() {
  const params = useSearchParams();
  const token = params.get("__visit");
  useEffect(() => {
    if (!token) return;
    let started = false;
    async function confirm() {
      if (started || document.visibilityState !== "visible") return;
      started = true;
      const url = new URL(window.location.href);
      // Служебный параметр не остаётся в адресе, при копировании и обновлении.
      if (url.searchParams.get("__visit") === token) {
        url.searchParams.delete("__visit");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
      // Одинаковый token при повторе запроса даёт ту же запись в базе.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch("/api/tracking/visit", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }), keepalive: true,
          });
          if (response.ok || response.status < 500) return;
        } catch { /* Повтор с тем же id безопасен даже после потерянного ответа. */ }
      }
    }
    void confirm();
    document.addEventListener("visibilitychange", confirm);
    return () => document.removeEventListener("visibilitychange", confirm);
  }, [token]);
  return null;
}
