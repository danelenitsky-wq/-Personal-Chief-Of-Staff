"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, SlidersHorizontal } from "lucide-react";
import type { Project, Task } from "@/types/domain";
import { PRIORITIES, TASK_CONTEXTS } from "@/types/domain";
import type { TaskView } from "@/services/task-service";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { TaskDetailSheet } from "./task-detail-sheet";
import { QuickAdd } from "./quick-add";

const VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  someday: "Someday",
  completed: "Completed",
};

const DURATIONS = [
  { value: "", label: "Any duration" },
  { value: "15", label: "≤ 15 min" },
  { value: "30", label: "≤ 30 min" },
  { value: "60", label: "≤ 1 hour" },
  { value: "61", label: "> 1 hour" },
];

type Props = {
  view: TaskView;
  counts: Record<TaskView, number>;
  tasks: Task[];
  projects: Pick<Project, "id" | "name">[];
  lifeAreas: string[];
  today: string;
};

export function TasksView({ view, counts, tasks, projects, lifeAreas, today }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ area: "", project: "", priority: "", duration: "", context: "" });
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const visible = tasks.filter((t) => {
    if (filters.area && t.lifeArea !== filters.area) return false;
    if (filters.project && t.projectId !== filters.project) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.context && t.context !== filters.context) return false;
    if (filters.duration) {
      const limit = Number(filters.duration);
      const m = t.estimatedMinutes ?? 0;
      if (limit > 60 ? m <= 60 : !m || m > limit) return false;
    }
    return true;
  });

  const setFilter = (key: keyof typeof filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const openTask = tasks.find((t) => t.id === openId) ?? null;

  const quickAddDefaults =
    view === "today" ? { plannedDate: today } : view === "someday" ? { status: "someday" as const } : {};

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none]">
        {(Object.keys(VIEW_LABELS) as TaskView[]).map((v) => (
          <Link
            key={v}
            href={`/tasks?view=${v}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              v === view ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {VIEW_LABELS[v]}
            {v !== "completed" && counts[v] > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  v === "overdue" ? "bg-destructive/10 text-destructive" : "bg-background text-muted-foreground",
                )}
              >
                {counts[v]}
              </span>
            )}
          </Link>
        ))}
      </div>

      {view !== "completed" && view !== "overdue" && (
        <QuickAdd
          defaults={quickAddDefaults}
          placeholder={view === "today" ? "Add a task for today…" : "Add a task… (e.g. Call the insurance company)"}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <NativeSelect value={filters.area} onChange={setFilter("area")} className="h-8 w-auto text-xs">
          <option value="">All areas</option>
          {lifeAreas.map((a) => <option key={a} value={a}>{a}</option>)}
        </NativeSelect>
        <NativeSelect value={filters.project} onChange={setFilter("project")} className="h-8 w-auto text-xs">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
        <NativeSelect value={filters.priority} onChange={setFilter("priority")} className="h-8 w-auto text-xs">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </NativeSelect>
        <NativeSelect value={filters.duration} onChange={setFilter("duration")} className="h-8 w-auto text-xs">
          {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </NativeSelect>
        <NativeSelect value={filters.context} onChange={setFilter("context")} className="h-8 w-auto text-xs">
          <option value="">Any context</option>
          {TASK_CONTEXTS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </NativeSelect>
        {activeFilters > 0 && (
          <button
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setFilters({ area: "", project: "", priority: "", duration: "", context: "" })}
          >
            Clear
          </button>
        )}
      </div>

      <Card className="divide-y overflow-hidden">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Inbox className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              {activeFilters ? "No tasks match these filters" : view === "overdue" ? "Nothing overdue" : "Nothing here"}
            </p>
            <p className="text-xs text-muted-foreground">
              {view === "inbox" ? "New tasks without a date or project land here." : "You're clear."}
            </p>
          </div>
        ) : (
          visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              projectName={task.projectId ? projectName.get(task.projectId) : undefined}
              onOpen={(t) => setOpenId(t.id)}
            />
          ))
        )}
      </Card>

      <TaskDetailSheet task={openTask} projects={projects} lifeAreas={lifeAreas} onClose={() => setOpenId(null)} />
    </div>
  );
}
