import "server-only";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_USER_ID } from "@/lib/db/memory/seed";

export type SessionUser = { id: string; email: string | null; demo: boolean };

/** Returns the signed-in user, or the demo user when Supabase is not configured. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) {
    return { id: DEMO_USER_ID, email: "demo@example.com", demo: true };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null, demo: false } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
