/**
 * Deterministic planning helpers for Phase 1: priority scoring, Top 3 and the
 * Today timeline. Phase 6 adds the AI planning agent on top of these.
 */
import type { CalendarEvent, Task, UserProfile } from "@/types/domain";
import {
  diffInDays,
  dayOfIso,
  minutesToTime,
  nowTimeIn,
  timeOfIso,
  timeToMinutes,
} from "@/lib/dates";
import type { Repositories } from "@/lib/db/types";
import { systemClock, type Clock } from "./clock";
import { effectiveDate, isActiveTask, isOverdue } from "./task-service";
import { freeMinutesInWorkingHours, type CalendarService } from "./calendar-service";
import type { ProfileService } from "./profile-service";
import type { ProjectService, ProjectSummary } from "./project-service";
import type { WaitingService, WaitingView } from "./waiting-service";

export type ScoreContext = { today: string; nextActionIds: Set<string> };

/**
 * Internal score. Never shown to the user: the UI only shows High/Normal/Low.
 */
export function computePriorityScore(task: Task, { today, nextActionIds }: ScoreContext): number {
  let score = { high: 30, normal: 15, low: 5 }[task.priority];

  if (task.dueDate) {
    const daysLeft = diffInDays(today, task.dueDate);
    if (daysLeft < 0) score += 40 + Math.min(20, -daysLeft * 2);
    else if (daysLeft === 0) score += 35;
    else if (daysLeft <= 2) score += 20;
    else if (daysLeft <= 7) score += 8;
  }
  if (task.plannedDate === today) score += 25;
  else if (task.plannedDate && task.plannedDate > today) score -= 15;

  // Next Actions unblock whole projects.
  if (nextActionIds.has(task.id)) score += 10;

  // Old tasks slowly rise so nothing rots silently...
  const ageDays = Math.max(0, diffInDays(task.createdAt.slice(0, 10), today));
  score += Math.min(10, Math.floor(ageDays / 7) * 2);

  // ...but repeatedly postponed tasks stop being pushed on every brief.
  score -= Math.min(20, task.postponeCount * 5);

  // Quick wins get a small nudge.
  if (task.estimatedMinutes && task.estimatedMinutes <= 15) score += 3;
  return score;
}

/** Up to `limit` major priorities for today, highest score first. */
export function pickTopTasks(tasks: Task[], ctx: ScoreContext, limit = 3): Task[] {
  return tasks
    .filter((t) => isActiveTask(t) && t.status !== "waiting")
    .filter((t) => {
      // Only tasks that plausibly belong to today: overdue, due or planned
      // today, due soon, or unscheduled high priority.
      const date = effectiveDate(t);
      if (isOverdue(t, ctx.today)) return true;
      if (!date) return t.priority === "high" || ctx.nextActionIds.has(t.id);
      if (t.plannedDate && t.plannedDate > ctx.today) return false;
      return diffInDays(ctx.today, date) <= 2;
    })
    .map((t) => ({ t, score: computePriorityScore(t, ctx) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => t);
}

export type TimelineItem =
  | { kind: "event"; start: string; end: string; title: string; location?: string | null }
  | { kind: "task"; start: string; end: string; title: string; taskId: string; completed: boolean }
  | { kind: "free"; start: string; end: string; minutes: number };

/**
 * Merges calendar events and timed tasks for one day and fills the gaps
 * inside working hours with "Free" blocks of at least 30 minutes.
 */
export function buildTimeline(
  day: string,
  events: CalendarEvent[],
  tasks: Task[],
  profile: Pick<UserProfile, "timezone" | "workingHoursStart" | "workingHoursEnd">,
): TimelineItem[] {
  const tz = profile.timezone;
  const items: TimelineItem[] = [];

  for (const e of events) {
    if (e.allDay || dayOfIso(e.start, tz) !== day) continue;
    items.push({ kind: "event", start: timeOfIso(e.start, tz), end: timeOfIso(e.end, tz), title: e.title, location: e.location });
  }
  for (const t of tasks) {
    if (!t.dueTime || effectiveDate(t) !== day || t.status === "cancelled") continue;
    const start = timeToMinutes(t.dueTime);
    items.push({
      kind: "task",
      start: t.dueTime,
      end: minutesToTime(Math.min(24 * 60 - 1, start + (t.estimatedMinutes ?? 15))),
      title: t.title,
      taskId: t.id,
      completed: t.status === "completed",
    });
  }
  items.sort((a, b) => a.start.localeCompare(b.start));

  const workStart = timeToMinutes(profile.workingHoursStart ?? "09:00");
  const workEnd = timeToMinutes(profile.workingHoursEnd ?? "18:00");
  const withFree: TimelineItem[] = [];
  let cursor = workStart;
  for (const item of items) {
    const s = timeToMinutes(item.start);
    if (s - cursor >= 30 && s <= workEnd) {
      withFree.push({ kind: "free", start: minutesToTime(cursor), end: item.start, minutes: s - cursor });
    }
    withFree.push(item);
    cursor = Math.max(cursor, timeToMinutes(item.end));
  }
  if (workEnd - cursor >= 30) {
    withFree.push({ kind: "free", start: minutesToTime(cursor), end: minutesToTime(workEnd), minutes: workEnd - cursor });
  }
  return withFree;
}

export type TodayOverview = {
  profile: UserProfile;
  today: string;
  greeting: string;
  freeMinutes: number;
  dueTodayCount: number;
  overdueCount: number;
  waitingCount: number;
  topTasks: Task[];
  timeline: TimelineItem[];
  waiting: WaitingView[];
  projects: ProjectSummary[];
};

export function greetingFor(time: string, name?: string): string {
  const hour = Number(time.slice(0, 2));
  const part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

export function createPlanningService(deps: {
  repos: Repositories;
  profiles: ProfileService;
  projects: ProjectService;
  waiting: WaitingService;
  calendar: CalendarService;
  clock?: Clock;
}) {
  const clock = deps.clock ?? systemClock;

  return {
    async getTodayOverview(userId: string): Promise<TodayOverview> {
      const { today, profile } = await deps.profiles.getToday(userId);
      const [tasks, projects, waiting, availability] = await Promise.all([
        deps.repos.tasks.list(userId),
        deps.projects.listProjects(userId, ["active"]),
        deps.waiting.listWaiting(userId),
        deps.calendar.getDayAvailability(userId, profile, today),
      ]);

      const nextActionIds = new Set(
        projects.map((p) => p.nextAction?.id).filter((id): id is string => Boolean(id)),
      );
      const now = nowTimeIn(profile.timezone, clock());
      const active = tasks.filter(isActiveTask);

      return {
        profile,
        today,
        greeting: greetingFor(now, profile.name),
        freeMinutes: freeMinutesInWorkingHours(availability.events, today, profile, now),
        dueTodayCount: active.filter((t) => t.dueDate === today || t.plannedDate === today).length,
        overdueCount: active.filter((t) => isOverdue(t, today)).length,
        waitingCount: waiting.length,
        topTasks: pickTopTasks(tasks, { today, nextActionIds }),
        timeline: buildTimeline(today, availability.events, tasks, profile),
        waiting: waiting.slice(0, 4),
        projects: projects.slice(0, 5),
      };
    },
  };
}

export type PlanningService = ReturnType<typeof createPlanningService>;
