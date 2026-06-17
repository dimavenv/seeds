"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
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
