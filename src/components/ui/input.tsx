import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-destructive";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldClass, "h-9 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "min-h-20 py-2", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldClass, "h-9 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />;
}
