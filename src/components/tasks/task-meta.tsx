import { CalendarClock, Clock, Folder } from "lucide-react";
import type { Priority, Task } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { formatDayLabel, formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", normal: "Normal", low: "Low" };

export function PriorityBadge({ priority, hideNormal = false }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && priority === "normal") return null;
  return <Badge variant={priority === "high" ? "high" : priority === "low" ? "low" : "outline"}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function LifeAreaTag({ area }: { area?: string | null }) {
  if (!area) return null;
  return <span className="text-xs text-muted-foreground">{area}</span>;
}

export function DueLabel({ task, today }: { task: Task; today: string }) {
  const date = task.dueDate ?? task.plannedDate;
  if (!date) return null;
  const overdue = task.status !== "completed" && task.dueDate != null && task.dueDate < today;
  const planned = !task.dueDate && task.plannedDate;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
      title={planned ? "Planned day" : "Due date"}
    >
      <CalendarClock className="size-3" />
      {planned ? "Planned " : ""}
      {formatDayLabel(date, today)}
      {task.dueTime ? ` ${task.dueTime}` : ""}
    </span>
  );
}

export function DurationLabel({ minutes }: { minutes?: number | null }) {
  if (!minutes) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Clock className="size-3" />
      {formatMinutes(minutes)}
    </span>
  );
}

export function ProjectLabel({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex max-w-40 items-center gap-1 truncate text-xs text-muted-foreground">
      <Folder className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Dot() {
  return <span className="text-muted-foreground/40">·</span>;
}
