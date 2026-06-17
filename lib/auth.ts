import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";

export type SessionInfo = {
  configured: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

export async function getSession(): Promise<SessionInfo> {
  if (!isSupabaseConfigured()) {
    return { configured: false, userId: null, email: null, isAdmin: false };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { configured: true, userId: null, email: null, isAdmin: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    configured: true,
    userId: user.id,
    email: user.email ?? null,
    isAdmin: profile?.role === "admin",
  };
}
