import type { Task } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { ScheduleMenu } from "@/components/tasks/schedule-menu";
import { DueLabel, DurationLabel, LifeAreaTag, PriorityBadge } from "@/components/tasks/task-meta";

export function TopTaskCard({ task, index, today }: { task: Task; index: number; today: string }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xs font-medium text-muted-foreground tabular-nums">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{task.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <LifeAreaTag area={task.lifeArea} />
            <DurationLabel minutes={task.estimatedMinutes} />
            <DueLabel task={task} today={today} />
          </div>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <TaskCheckbox taskId={task.id} completed={task.status === "completed"} label={task.title} />
          Complete
        </label>
        <ScheduleMenu taskId={task.id} today={today} />
      </div>
    </Card>
  );
}
