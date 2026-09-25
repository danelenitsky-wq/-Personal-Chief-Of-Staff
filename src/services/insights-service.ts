import type { Task } from "@/types/domain";
import { addDays, dayOfIso, startOfWeek } from "@/lib/dates";
import type { Repositories } from "@/lib/db/types";
import { isOverdue } from "./task-service";
import type { ProfileService } from "./profile-service";
import type { ProjectService, ProjectSummary } from "./project-service";
import type { WaitingService } from "./waiting-service";

export type Insights = {
  completedThisWeek: number;
  completedLastWeek: number;
  postponedCount: number;
  overdueCount: number;
  waitingCount: number;
  overdueWaitingCount: number;
  byLifeArea: { area: string; completed: number; open: number }[];
  mostPostponed: Task[];
  projects: ProjectSummary[];
};

export function createInsightsService(deps: {
  repos: Repositories;
  profiles: ProfileService;
  projects: ProjectService;
  waiting: WaitingService;
}) {
  return {
    async getInsights(userId: string): Promise<Insights> {
      const { today, profile } = await deps.profiles.getToday(userId);
      const [tasks, projects, waiting] = await Promise.all([
        deps.repos.tasks.list(userId),
        deps.projects.listProjects(userId, ["active"]),
        deps.waiting.listWaiting(userId),
      ]);
      const weekStart = startOfWeek(today, profile.weekStartsOn);
      const lastWeekStart = addDays(weekStart, -7);
      const completedDay = (t: Task) => (t.completedAt ? dayOfIso(t.completedAt, profile.timezone) : null);
      const completed = tasks.filter((t) => t.status === "completed");

      const areas = new Map<string, { completed: number; open: number }>();
      for (const t of tasks) {
        const area = t.lifeArea ?? "Unsorted";
        const entry = areas.get(area) ?? { completed: 0, open: 0 };
        if (t.status === "completed") {
          const d = completedDay(t);
          if (d && d >= weekStart) entry.completed++;
        } else if (t.status === "open" || t.status === "scheduled") entry.open++;
        areas.set(area, entry);
      }

      return {
        completedThisWeek: completed.filter((t) => (completedDay(t) ?? "") >= weekStart).length,
        completedLastWeek: completed.filter((t) => {
          const d = completedDay(t) ?? "";
          return d >= lastWeekStart && d < weekStart;
        }).length,
        postponedCount: tasks.filter((t) => t.postponeCount > 0 && t.status !== "completed").length,
        overdueCount: tasks.filter((t) => isOverdue(t, today)).length,
        waitingCount: waiting.length,
        overdueWaitingCount: waiting.filter((w) => w.overdue).length,
        byLifeArea: [...areas.entries()]
          .map(([area, v]) => ({ area, ...v }))
          .filter((a) => a.completed + a.open > 0)
          .sort((a, b) => b.completed + b.open - (a.completed + a.open)),
        mostPostponed: tasks
          .filter((t) => t.postponeCount >= 2 && t.status !== "completed" && t.status !== "cancelled")
          .sort((a, b) => b.postponeCount - a.postponeCount)
          .slice(0, 5),
        projects,
      };
    },
  };
}

export type InsightsService = ReturnType<typeof createInsightsService>;
