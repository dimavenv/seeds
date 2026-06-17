"use client";

import { createBrowserClient } from "@supabase/ssr";
import { fetchWithTimeout } from "@/lib/supabase/fetch";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithTimeout(5000) } }
  );
}
