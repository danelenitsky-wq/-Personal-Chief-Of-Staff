"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav";

/** Compact horizontal nav for small screens. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          CS
        </span>
        <span className="text-sm font-semibold">Chief of Staff</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
              isActivePath(pathname, href) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
