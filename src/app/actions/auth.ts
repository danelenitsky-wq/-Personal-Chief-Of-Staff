"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) redirect("/");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(form.get("next")));
}

export async function sendMagicLinkAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) redirect("/");
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}` },
  });
  if (error) return { error: error.message };
  return { message: "Check your email for a sign-in link." };
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
