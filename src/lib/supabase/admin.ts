import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for trusted server jobs only (WhatsApp webhook, cron).
 * Bypasses RLS: callers must always scope queries by user_id.
 * Never import this from a component or expose the key to the browser.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
