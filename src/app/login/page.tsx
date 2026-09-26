import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Supabase isn&apos;t configured, so the app is running in demo mode with mock data.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Open the dashboard →</Link>
      </Shell>
    );
  }
  if (await getSessionUser()) redirect(next);
  return (
    <Shell>
      {error && <p className="mb-4 text-sm text-destructive">That sign-in link didn&apos;t work. Try again.</p>}
      <LoginForm next={next} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">CS</span>
          <div>
            <h1 className="font-semibold">Chief of Staff</h1>
            <p className="text-xs text-muted-foreground">Sign in to your command center</p>
          </div>
        </div>
        {children}
      </Card>
    </main>
  );
}
