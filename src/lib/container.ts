import "server-only";
import { createServices, type Services } from "@/services";
import { isSupabaseConfigured } from "@/lib/env";
import { createMemoryRepositories, type MemoryStore } from "@/lib/db/memory/store";
import { buildDemoStore } from "@/lib/db/memory/seed";
import { createSupabaseRepositories } from "@/lib/db/supabase/repositories";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Demo mode keeps its data on globalThis so it survives hot reloads in dev.
const globalForDemo = globalThis as unknown as { __cosDemoStore?: MemoryStore };

/**
 * Services for the current request. With Supabase configured they run on the
 * user's session (RLS enforced); otherwise on the in-memory demo store.
 */
export async function getServices(): Promise<Services> {
  if (isSupabaseConfigured()) {
    const client = await createSupabaseServerClient();
    return createServices(createSupabaseRepositories(client));
  }
  globalForDemo.__cosDemoStore ??= buildDemoStore();
  return createServices(createMemoryRepositories(globalForDemo.__cosDemoStore));
}
