"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { Task } from "@/types/domain";
import type { PlannerWeek } from "@/services/planner-service";
import { planTaskAction } from "@/app/actions/tasks";
import { formatMinutes, formatShortDate, formatWeekdayShort, timeOfIso } from "@/lib/dates";
import { effectiveDate } from "@/services/task-service";
import { cn } from "@/lib/utils";

const UNSCHEDULED = "unscheduled";

export function PlannerBoard({ week }: { week: PlannerWeek }) {
  const [tasks, setTasks] = useState<Task[]>(() => [...week.days.flatMap((d) => d.tasks), ...week.unscheduled]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  useEffect(() => setTasks([...week.days.flatMap((d) => d.tasks), ...week.unscheduled]), [week]);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const taskId = String(active.id);
    const target = String(over.id);
    const day = target === UNSCHEDULED ? null : target;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || effectiveDate(task) === day) return;

    // Optimistic: dropping on a day only sets the planned day.
    setTasks((all) => all.map((t) => (t.id === taskId ? { ...t, plannedDate: day } : t)));
    startTransition(async () => {
      const result = await planTaskAction(taskId, day);
      if (!result.ok) {
        setError(result.error);
        setTasks((all) => all.map((t) => (t.id === taskId ? task : t)));
      }
    });
  }

  const unscheduled = tasks.filter((t) => !effectiveDate(t) && t.status !== "completed");

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-4 2xl:flex-row">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {week.days.map((day) => {
            const dayTasks = tasks.filter((t) => effectiveDate(t) === day.date);
            const planned = dayTasks.reduce((m, t) => m + (t.status !== "completed" ? (t.estimatedMinutes ?? 0) : 0), 0);
            return (
              <DayColumn key={day.date} id={day.date} isToday={day.date === week.today} isPast={day.date < week.today}>
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <p className={cn("text-xs font-medium", day.date === week.today ? "text-primary" : "text-muted-foreground")}>
                      {formatWeekdayShort(day.date)}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">{formatShortDate(day.date)}</p>
                  </div>
                  {planned > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{formatMinutes(planned)}</span>}
                </div>
                <div className="space-y-1.5">
                  {day.events.map((e) => (
                    <div key={e.id} className="rounded-md border-l-2 border-primary/70 bg-accent/60 px-2 py-1.5">
                      <p className="truncate text-xs font-medium">{e.title}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {timeOfIso(e.start, week.timeZone)}–{timeOfIso(e.end, week.timeZone)}
                      </p>
                    </div>
                  ))}
                  {dayTasks.map((t) => <TaskChip key={t.id} task={t} />)}
                </div>
              </DayColumn>
            );
          })}
        </div>

        <UnscheduledPanel count={unscheduled.length}>
          {unscheduled.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Everything has a day.</p>}
          {unscheduled.map((t) => <TaskChip key={t.id} task={t} />)}
        </UnscheduledPanel>
      </div>
    </DndContext>
  );
}

function DayColumn({ id, isToday, isPast, children }: { id: string; isToday: boolean; isPast: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-72 rounded-xl border bg-card p-2.5 transition-colors",
        isToday && "border-primary/40 ring-1 ring-primary/20",
        isPast && "bg-muted/30",
        isOver && "border-primary bg-accent/40",
      )}
    >
      {children}
    </div>
  );
}

function UnscheduledPanel({ count, children }: { count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNSCHEDULED });
  return (
    <aside
      ref={setNodeRef}
      className={cn("w-full shrink-0 rounded-xl border bg-card p-3 transition-colors 2xl:w-72", isOver && "border-primary bg-accent/40")}
    >
      <p className="text-sm font-semibold">Unscheduled</p>
      <p className="mb-3 text-xs text-muted-foreground">{count} tasks · drag onto a day</p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1">{children}</div>
    </aside>
  );
}

function TaskChip({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const done = task.status === "completed";
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
      {...attributes}
      className={cn(
        "group flex cursor-grab touch-none items-start gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs shadow-xs active:cursor-grabbing",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/30",
        done && "opacity-50",
        task.priority === "high" && !done && "border-l-2 border-l-destructive/70",
      )}
    >
      <GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
      <div className="min-w-0">
        <p className={cn("leading-snug [overflow-wrap:anywhere]", done && "line-through")}>{task.title}</p>
        {(task.estimatedMinutes || task.dueTime) && (
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {task.dueTime ? `${task.dueTime} · ` : ""}
            {task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : ""}
          </p>
        )}
      </div>
    </div>
  );
}
