"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { sendMagicLinkAction, signInAction, type AuthState } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState<AuthState, FormData>(signInAction, {});
  const [mlState, mlAction, mlPending] = useActionState<AuthState, FormData>(sendMagicLinkAction, {});
  const state = mode === "password" ? pwState : mlState;

  return (
    <form action={mode === "password" ? pwAction : mlAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {mode === "password" && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm text-success">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pwPending || mlPending}>
        {mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
      >
        {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
      </button>
    </form>
  );
}
