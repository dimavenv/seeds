"use client";

import { useState } from "react";
import { clearAuth } from "@/lib/pb/client";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      clearAuth();
    } catch {
      // игнорируем
    }
    window.location.assign("/");
  }

  return (
    <button onClick={logout} disabled={loading} className="btn-outline">
      {loading ? "Выход…" : "Выйти"}
    </button>
  );
}
