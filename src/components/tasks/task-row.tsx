"use client";

import type { Task } from "@/types/domain";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";
import { DueLabel, DurationLabel, LifeAreaTag, PriorityBadge, ProjectLabel } from "./task-meta";

export function TaskRow({
  task,
  today,
  projectName,
  onOpen,
}: {
  task: Task;
  today: string;
  projectName?: string;
  onOpen: (task: Task) => void;
}) {
  const done = task.status === "completed";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task)}
      className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <TaskCheckbox taskId={task.id} completed={done} label={task.title} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
          <LifeAreaTag area={task.lifeArea} />
          <DueLabel task={task} today={today} />
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-4 sm:flex">
        <ProjectLabel name={projectName} />
        <span className="w-24 text-right"><LifeAreaTag area={task.lifeArea} /></span>
        <span className="w-16 text-right"><DurationLabel minutes={task.estimatedMinutes} /></span>
        <span className="w-28 text-right"><DueLabel task={task} today={today} /></span>
        <span className="w-14 text-right"><PriorityBadge priority={task.priority} hideNormal /></span>
      </div>
    </div>
  );
}
