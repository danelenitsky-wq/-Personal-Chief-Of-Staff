"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";
import { NAV_ITEMS, isActivePath } from "./nav";

type Props = {
  userLabel: string;
  demo: boolean;
  counts: { today: number; overdue: number; waiting: number };
  whatsappConnected: boolean;
};

export function Sidebar({ userLabel, demo, counts, whatsappConnected }: Props) {
  const pathname = usePathname();
  const badge: Record<string, number | undefined> = {
    "/": counts.today || undefined,
    "/tasks": counts.overdue || undefined,
    "/waiting": counts.waiting || undefined,
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 lg:flex">
      <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          CS
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Chief of Staff</span>
          <span className="block text-xs text-muted-foreground">Command center</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active ? "text-primary" : "")} />
              <span className="flex-1">{label}</span>
              {badge[href] ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium tabular-nums",
                    href === "/tasks" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                  )}
                >
                  {badge[href]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-lg border bg-card p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <MessageCircle className="size-3.5 text-success" /> WhatsApp
          </div>
          <p className="text-muted-foreground">
            {whatsappConnected ? "Connected. Text your Chief of Staff." : "Not connected yet. See Settings."}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userLabel}</p>
            <p className="text-xs text-muted-foreground">{demo ? "Demo mode · mock data" : "Signed in"}</p>
          </div>
          {!demo && (
            <form action={signOutAction}>
              <button className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
