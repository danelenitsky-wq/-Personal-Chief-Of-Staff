import type { TimelineItem } from "@/services/planning-service";
import { formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function Timeline({ items, now }: { items: TimelineItem[]; now: string }) {
  if (items.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">Nothing scheduled today.</p>;
  }
  return (
    <ol className="px-5 py-3">
      {items.map((item, i) => {
        const past = item.end <= now;
        return (
          <li key={i} className={cn("flex gap-4 py-2", past && "opacity-50")}>
            <span className="w-11 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{item.start}</span>
            <div
              className={cn(
                "flex-1 rounded-md border-l-2 px-3 py-1.5",
                item.kind === "event" && "border-primary bg-accent/60",
                item.kind === "task" && "border-success bg-success/8",
                item.kind === "free" && "border-dashed border-border",
              )}
            >
              {item.kind === "free" ? (
                <p className="text-xs text-muted-foreground">Free · {formatMinutes(item.minutes)}</p>
              ) : (
                <>
                  <p className={cn("text-sm", item.kind === "task" && item.completed && "line-through")}>{item.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {item.start}–{item.end}
                    {item.kind === "event" && item.location ? ` · ${item.location}` : ""}
                    {item.kind === "task" ? " · Task" : ""}
                  </p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
