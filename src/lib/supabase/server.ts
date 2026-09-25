import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";

/** Supabase client bound to the signed-in user's session (RLS applies). */
export async function createSupabaseServerClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there and
          // the middleware refreshes the session instead.
        }
      },
    },
  });
}
