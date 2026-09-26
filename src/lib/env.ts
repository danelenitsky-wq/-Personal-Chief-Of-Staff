/**
 * Environment access. Only public Supabase values are required for the
 * dashboard; everything else is optional until its phase is built.
 * Without Supabase values the app runs in demo mode on mock data.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function isSupabaseConfigured(): boolean {
  return supabaseEnv() !== null;
}

export function integrationStatus() {
  return {
    supabase: isSupabaseConfigured(),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_APP_SECRET &&
        process.env.WHATSAPP_VERIFY_TOKEN,
    ),
    googleCalendar: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
}
