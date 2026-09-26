"use client";

import { useOptimistic, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { setTaskCompletedAction } from "@/app/actions/tasks";

export function TaskCheckbox({ taskId, completed, label }: { taskId: string; completed: boolean; label: string }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(completed);

  return (
    <Checkbox
      checked={optimistic}
      disabled={pending}
      aria-label={optimistic ? `Mark "${label}" as not done` : `Complete "${label}"`}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value === true);
          await setTaskCompletedAction(taskId, value === true);
        })
      }
    />
  );
}
