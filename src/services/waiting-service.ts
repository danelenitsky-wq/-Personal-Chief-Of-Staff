import { fromZonedTime } from "date-fns-tz";
import type { Reminder, Task, WaitingFor } from "@/types/domain";
import type { Repositories } from "@/lib/db/types";
import { addDays, diffInDays, dayOfIso } from "@/lib/dates";
import {
  createWaitingForSchema,
  updateWaitingForSchema,
  type CreateWaitingForInput,
  type UpdateWaitingForInput,
} from "@/lib/validation/schemas";
import { NotFoundError, validate } from "./errors";
import { systemClock, type Clock } from "./clock";
import type { ProfileService } from "./profile-service";
import type { TaskService } from "./task-service";

export type WaitingView = WaitingFor & {
  daysWaiting: number;
  overdue: boolean;
  /** Days past expectedBy (0 when not overdue). */
  daysOverdue: number;
};

export function toWaitingView(item: WaitingFor, today: string, timeZone: string): WaitingView {
  const since = dayOfIso(item.createdAt, timeZone);
  const overdue = item.status === "waiting" && Boolean(item.expectedBy) && item.expectedBy! < today;
  return {
    ...item,
    daysWaiting: Math.max(0, diffInDays(since, today)),
    overdue,
    daysOverdue: overdue ? diffInDays(item.expectedBy!, today) : 0,
  };
}

/** Overdue first (most overdue on top), then by expected date, then oldest. */
export function sortWaiting(items: WaitingView[]): WaitingView[] {
  return [...items].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      b.daysOverdue - a.daysOverdue ||
      (a.expectedBy ?? "9999").localeCompare(b.expectedBy ?? "9999") ||
      b.daysWaiting - a.daysWaiting,
  );
}

export function createWaitingService(
  repos: Repositories,
  profiles: ProfileService,
  tasks: TaskService,
  clock: Clock = systemClock,
) {
  async function requireItem(userId: string, id: string): Promise<WaitingFor> {
    const item = await repos.waiting.get(userId, id);
    if (!item) throw new NotFoundError("Waiting item");
    return item;
  }

  return {
    async listWaiting(
      userId: string,
      statuses: WaitingFor["status"][] = ["waiting"],
    ): Promise<WaitingView[]> {
      const { today, profile } = await profiles.getToday(userId);
      const items = await repos.waiting.list(userId, { status: statuses });
      return sortWaiting(items.map((i) => toWaitingView(i, today, profile.timezone)));
    },

    async createWaitingFor(userId: string, input: CreateWaitingForInput): Promise<WaitingFor> {
      const data = validate(createWaitingForSchema, input);
      if (data.projectId && !(await repos.projects.get(userId, data.projectId))) {
        throw new NotFoundError("Project");
      }
      return repos.waiting.insert(userId, {
        person: data.person,
        topic: data.topic,
        description: data.description ?? null,
        expectedBy: data.expectedBy ?? null,
        projectId: data.projectId ?? null,
        status: "waiting",
        completedAt: null,
      });
    },

    async updateWaitingFor(userId: string, id: string, input: UpdateWaitingForInput): Promise<WaitingFor> {
      const data = validate(updateWaitingForSchema, input);
      const current = await requireItem(userId, id);
      const completedAt =
        data.status && data.status !== current.status
          ? data.status === "completed"
            ? clock().toISOString()
            : null
          : undefined;
      const updated = await repos.waiting.update(userId, id, {
        ...data,
        ...(completedAt !== undefined ? { completedAt } : {}),
      });
      if (!updated) throw new NotFoundError("Waiting item");
      return updated;
    },

    /** "They replied": closes the waiting item. */
    async completeWaitingFor(userId: string, id: string): Promise<WaitingFor> {
      const current = await requireItem(userId, id);
      if (current.status === "completed") return current;
      const updated = await repos.waiting.update(userId, id, {
        status: "completed",
        completedAt: clock().toISOString(),
      });
      if (!updated) throw new NotFoundError("Waiting item");
      return updated;
    },

    /** Creates a short "follow up" phone task due today. */
    async createFollowUpTask(userId: string, id: string): Promise<Task> {
      const item = await requireItem(userId, id);
      const { today } = await profiles.getToday(userId);
      const result = await tasks.createTask(
        userId,
        {
          title: `Follow up with ${item.person} about ${item.topic.toLowerCase()}`,
          dueDate: today,
          estimatedMinutes: 10,
          context: "phone",
          priority: item.expectedBy && item.expectedBy < today ? "high" : "normal",
          projectId: item.projectId ?? null,
          source: "dashboard",
        },
        { allowDuplicate: false },
      );
      return result.ok ? result.task : result.duplicates[0];
    },

    /** Schedules a reminder for tomorrow at the user's morning brief time. */
    async remindTomorrow(userId: string, id: string): Promise<Reminder> {
      await requireItem(userId, id);
      const { today, profile } = await profiles.getToday(userId);
      const time = profile.morningBriefTime ?? "09:00";
      const remindAt = fromZonedTime(`${addDays(today, 1)}T${time}:00`, profile.timezone).toISOString();
      return repos.reminders.insert(userId, {
        waitingForId: id,
        taskId: null,
        remindAt,
        status: "pending",
      });
    },
  };
}

export type WaitingService = ReturnType<typeof createWaitingService>;
