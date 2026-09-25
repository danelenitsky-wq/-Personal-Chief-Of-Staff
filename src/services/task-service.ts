import type { Source, Task, TaskActivity } from "@/types/domain";
import type { Repositories, TaskPatch } from "@/lib/db/types";
import {
  createTaskSchema,
  taskFilterSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type TaskFilter,
  type UpdateTaskInput,
} from "@/lib/validation/schemas";
import { NotFoundError, ValidationError, validate } from "./errors";
import { systemClock, type Clock } from "./clock";
import { DUPLICATE_THRESHOLD, titleSimilarity } from "./similarity";
import type { ProfileService } from "./profile-service";

export const TASK_VIEWS = ["inbox", "today", "upcoming", "overdue", "someday", "completed"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

const ACTIVE_STATUSES = new Set<Task["status"]>(["open", "scheduled", "waiting"]);

export const isActiveTask = (t: Task) => ACTIVE_STATUSES.has(t.status);

/** The day a task is expected to happen: its plan if set, otherwise its deadline. */
export const effectiveDate = (t: Task): string | null => t.plannedDate ?? t.dueDate ?? null;

/** Pure view predicate, shared by the dashboard and (later) the agent. */
export function isInView(task: Task, view: TaskView, today: string): boolean {
  switch (view) {
    case "inbox":
      return task.status === "open" && !task.dueDate && !task.plannedDate && !task.projectId;
    case "today":
      return isActiveTask(task) && (task.dueDate === today || task.plannedDate === today);
    case "upcoming": {
      const date = effectiveDate(task);
      return isActiveTask(task) && date !== null && date > today && !isOverdue(task, today);
    }
    case "overdue":
      return isOverdue(task, today);
    case "someday":
      return task.status === "someday";
    case "completed":
      return task.status === "completed";
  }
}

export function isOverdue(task: Task, today: string): boolean {
  return isActiveTask(task) && Boolean(task.dueDate) && task.dueDate! < today;
}

function sortForView(tasks: Task[], view: TaskView): Task[] {
  if (view === "completed") {
    return tasks.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
  const rank = { high: 0, normal: 1, low: 2 } as const;
  return tasks.sort(
    (a, b) =>
      (effectiveDate(a) ?? "9999").localeCompare(effectiveDate(b) ?? "9999") ||
      rank[a.priority] - rank[b.priority] ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: "duplicate"; duplicates: Task[] };

export function createTaskService(
  repos: Repositories,
  profiles: ProfileService,
  clock: Clock = systemClock,
) {
  const log = (userId: string, taskId: string, kind: TaskActivity["kind"], source: Source, detail?: string) =>
    repos.activity.add(userId, { taskId, kind, source, detail: detail ?? null });

  async function requireTask(userId: string, id: string): Promise<Task> {
    const task = await repos.tasks.get(userId, id);
    if (!task) throw new NotFoundError("Task");
    return task;
  }

  async function assertProjectOwned(userId: string, projectId: string | null | undefined) {
    if (projectId && !(await repos.projects.get(userId, projectId))) {
      throw new ValidationError("Project does not exist", [{ path: "projectId", message: "Unknown project" }]);
    }
  }

  async function findSimilarOpenTasks(userId: string, title: string): Promise<Task[]> {
    const open = await repos.tasks.list(userId, { status: ["open", "scheduled", "waiting", "someday"] });
    return open
      .map((task) => ({ task, score: titleSimilarity(title, task.title) }))
      .filter((m) => m.score >= DUPLICATE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.task);
  }

  return {
    findSimilarOpenTasks,

    async listTasks(userId: string, filter: TaskFilter = {}): Promise<Task[]> {
      return repos.tasks.list(userId, validate(taskFilterSchema, filter));
    },

    async getTask(userId: string, id: string): Promise<Task> {
      return requireTask(userId, id);
    },

    async getTaskActivity(userId: string, id: string) {
      await requireTask(userId, id);
      return repos.activity.listForTask(userId, id);
    },

    async getTaskView(userId: string, view: TaskView): Promise<Task[]> {
      const { today } = await profiles.getToday(userId);
      const all = await repos.tasks.list(userId);
      return sortForView(all.filter((t) => isInView(t, view, today)), view);
    },

    async countByView(userId: string): Promise<Record<TaskView, number>> {
      const { today } = await profiles.getToday(userId);
      const all = await repos.tasks.list(userId);
      return Object.fromEntries(
        TASK_VIEWS.map((v) => [v, all.filter((t) => isInView(t, v, today)).length]),
      ) as Record<TaskView, number>;
    },

    /**
     * Creates a task unless a similar open task exists. Callers show the
     * duplicates and retry with allowDuplicate when the user confirms.
     */
    async createTask(
      userId: string,
      input: CreateTaskInput,
      options: { allowDuplicate?: boolean } = {},
    ): Promise<CreateTaskResult> {
      const data = validate(createTaskSchema, input);
      await assertProjectOwned(userId, data.projectId);

      if (!options.allowDuplicate) {
        const duplicates = await findSimilarOpenTasks(userId, data.title);
        if (duplicates.length > 0) return { ok: false, reason: "duplicate", duplicates };
      }

      const task = await repos.tasks.insert(userId, {
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority,
        lifeArea: data.lifeArea ?? null,
        projectId: data.projectId ?? null,
        dueDate: data.dueDate ?? null,
        dueTime: data.dueTime ?? null,
        plannedDate: data.plannedDate ?? null,
        estimatedMinutes: data.estimatedMinutes ?? null,
        energyLevel: data.energyLevel ?? null,
        context: data.context ?? null,
        postponeCount: 0,
        source: data.source,
        completedAt: data.status === "completed" ? clock().toISOString() : null,
      });
      await log(userId, task.id, "created", data.source);
      return { ok: true, task };
    },

    async updateTask(
      userId: string,
      id: string,
      input: UpdateTaskInput,
      source: Source = "dashboard",
    ): Promise<Task> {
      const data = validate(updateTaskSchema, input);
      const current = await requireTask(userId, id);
      await assertProjectOwned(userId, data.projectId);

      const patch: TaskPatch = { ...data };
      const movedLater = (from?: string | null, to?: string | null) =>
        Boolean(from && to && to > from);
      const postponed =
        movedLater(current.dueDate, data.dueDate) || movedLater(current.plannedDate, data.plannedDate);
      if (postponed) patch.postponeCount = current.postponeCount + 1;

      if (data.status && data.status !== current.status) {
        patch.completedAt = data.status === "completed" ? clock().toISOString() : null;
      }

      const updated = await repos.tasks.update(userId, id, patch);
      if (!updated) throw new NotFoundError("Task");

      const statusChanged = data.status && data.status !== current.status;
      if (statusChanged && data.status === "completed") await log(userId, id, "completed", source);
      else if (statusChanged && current.status === "completed") await log(userId, id, "reopened", source);
      else if (postponed) {
        const to = data.plannedDate ?? data.dueDate;
        await log(userId, id, "postponed", source, to ? `Moved to ${to}` : undefined);
      } else await log(userId, id, "updated", source, Object.keys(data).join(", "));
      return updated;
    },

    /**
     * Completes a task. If it was its project's Next Action, the project's
     * oldest remaining open task is promoted so the project keeps moving;
     * with none left, the project shows "Needs attention".
     */
    async completeTask(userId: string, id: string, source: Source = "dashboard"): Promise<Task> {
      const current = await requireTask(userId, id);
      if (current.status === "completed") return current;

      const completed = await repos.tasks.update(userId, id, {
        status: "completed",
        completedAt: clock().toISOString(),
      });
      if (!completed) throw new NotFoundError("Task");
      await log(userId, id, "completed", source);

      if (current.projectId) {
        const project = await repos.projects.get(userId, current.projectId);
        if (project && project.nextActionTaskId === id) {
          const remaining = await repos.tasks.list(userId, {
            projectId: project.id,
            status: ["open", "scheduled"],
          });
          remaining.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          await repos.projects.update(userId, project.id, {
            nextActionTaskId: remaining[0]?.id ?? null,
          });
        }
      }
      return completed;
    },

    async reopenTask(userId: string, id: string, source: Source = "dashboard"): Promise<Task> {
      const current = await requireTask(userId, id);
      if (current.status !== "completed") return current;
      const reopened = await repos.tasks.update(userId, id, { status: "open", completedAt: null });
      if (!reopened) throw new NotFoundError("Task");
      await log(userId, id, "reopened", source);
      return reopened;
    },

    async deleteTask(userId: string, id: string): Promise<void> {
      await requireTask(userId, id);
      for (const project of await repos.projects.list(userId)) {
        if (project.nextActionTaskId === id) {
          await repos.projects.update(userId, project.id, { nextActionTaskId: null });
        }
      }
      const deleted = await repos.tasks.delete(userId, id);
      if (!deleted) throw new NotFoundError("Task");
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
