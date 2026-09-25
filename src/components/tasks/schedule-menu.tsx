"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planTaskAction } from "@/app/actions/tasks";
import { addDays } from "@/lib/dates";

/**
 * Plans a task for a day. Time-blocking on Google Calendar arrives in
 * Phase 5; until then "Schedule" sets the planned day only.
 */
export function ScheduleMenu({ taskId, today }: { taskId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const plan = (day: string | null) =>
    startTransition(async () => {
      await planTaskAction(taskId, day);
      setOpen(false);
    });

  const options: [string, string | null][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["In 2 days", addDays(today, 2)],
    ["Next week", addDays(today, 7)],
    ["Unschedule", null],
  ];

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="xs" disabled={pending} onClick={() => setOpen((v) => !v)}>
        <CalendarPlus /> Schedule
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border bg-popover p-1 shadow-lg">
          {options.map(([label, day]) => (
            <button
              key={label}
              onClick={() => plan(day)}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
