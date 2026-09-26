import type { CalendarEvent, Task } from "@/types/domain";
import { addDays, dayOfIso, weekDays } from "@/lib/dates";
import type { Repositories } from "@/lib/db/types";
import { effectiveDate, isActiveTask, type TaskService } from "./task-service";
import type { CalendarService } from "./calendar-service";
import type { ProfileService } from "./profile-service";

export type PlannerDay = { date: string; events: CalendarEvent[]; tasks: Task[] };
export type PlannerWeek = {
  today: string;
  weekStartsOn: 0 | 1;
  timeZone: string;
  days: PlannerDay[];
  unscheduled: Task[];
};

export function createPlannerService(deps: {
  repos: Repositories;
  profiles: ProfileService;
  tasks: TaskService;
  calendar: CalendarService;
}) {
  return {
    /** The 7-day week containing today + weekOffset weeks. */
    async getWeek(userId: string, weekOffset = 0): Promise<PlannerWeek> {
      const { today, profile } = await deps.profiles.getToday(userId);
      const days = weekDays(addDays(today, weekOffset * 7), profile.weekStartsOn);
      const [tasks, events] = await Promise.all([
        deps.repos.tasks.list(userId),
        deps.calendar.getEvents(userId, profile, days[0], days[6]),
      ]);
      const visible = tasks.filter((t) => isActiveTask(t) || t.status === "completed");

      return {
        today,
        weekStartsOn: profile.weekStartsOn,
        timeZone: profile.timezone,
        days: days.map((date) => ({
          date,
          events: events.filter((e) => dayOfIso(e.start, profile.timezone) === date),
          tasks: visible
            .filter((t) => effectiveDate(t) === date)
            .sort((a, b) => (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99")),
        })),
        unscheduled: tasks
          .filter((t) => isActiveTask(t) && !t.plannedDate && !t.dueDate)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      };
    },

    /**
     * Plans a task for a day (or clears the plan). This only sets the
     * planned day; it never creates a calendar event or changes the deadline.
     */
    async planTask(userId: string, taskId: string, day: string | null): Promise<Task> {
      return deps.tasks.updateTask(userId, taskId, { plannedDate: day });
    },
  };
}

export type PlannerService = ReturnType<typeof createPlannerService>;
