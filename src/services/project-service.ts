import type { Project, Task, WaitingFor } from "@/types/domain";
import type { Repositories } from "@/lib/db/types";
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@/lib/validation/schemas";
import { NotFoundError, ValidationError, validate } from "./errors";
import { isActiveTask } from "./task-service";

export type ProjectSummary = {
  project: Project;
  nextAction: Task | null;
  needsAttention: boolean;
  openCount: number;
  completedCount: number;
  /** 0..100 */
  progress: number;
};

export type ProjectDetail = ProjectSummary & {
  openTasks: Task[];
  completedTasks: Task[];
  blockedTasks: Task[];
  waiting: WaitingFor[];
};

/**
 * The project's Next Action, if it points at a task that is still actionable.
 * A pointer to a completed, cancelled or foreign task does not count.
 */
export function resolveNextAction(project: Project, projectTasks: Task[]): Task | null {
  if (!project.nextActionTaskId) return null;
  const task = projectTasks.find((t) => t.id === project.nextActionTaskId);
  return task && task.projectId === project.id && (task.status === "open" || task.status === "scheduled")
    ? task
    : null;
}

/** "Needs attention": an active project without an actionable Next Action. */
export function needsAttention(project: Project, projectTasks: Task[]): boolean {
  return project.status === "active" && resolveNextAction(project, projectTasks) === null;
}

export function summarizeProject(project: Project, projectTasks: Task[]): ProjectSummary {
  const counted = projectTasks.filter((t) => t.status !== "cancelled");
  const completedCount = counted.filter((t) => t.status === "completed").length;
  const openCount = counted.filter(isActiveTask).length;
  const total = completedCount + openCount;
  return {
    project,
    nextAction: resolveNextAction(project, projectTasks),
    needsAttention: needsAttention(project, projectTasks),
    openCount,
    completedCount,
    progress:
      project.status === "completed" ? 100 : total === 0 ? 0 : Math.round((completedCount / total) * 100),
  };
}

export function createProjectService(repos: Repositories) {
  async function requireProject(userId: string, id: string): Promise<Project> {
    const project = await repos.projects.get(userId, id);
    if (!project) throw new NotFoundError("Project");
    return project;
  }

  async function assertNextActionValid(userId: string, projectId: string | null, taskId?: string | null) {
    if (!taskId) return;
    const task = await repos.tasks.get(userId, taskId);
    if (!task || (projectId !== null && task.projectId !== projectId)) {
      throw new ValidationError("Next Action must be a task in this project", [
        { path: "nextActionTaskId", message: "Task is not part of this project" },
      ]);
    }
  }

  return {
    async listProjects(userId: string, statuses?: Project["status"][]): Promise<ProjectSummary[]> {
      const [projects, tasks] = await Promise.all([
        repos.projects.list(userId, statuses ? { status: statuses } : undefined),
        repos.tasks.list(userId),
      ]);
      const order = { active: 0, paused: 1, completed: 2, cancelled: 3 } as const;
      return projects
        .map((p) => summarizeProject(p, tasks.filter((t) => t.projectId === p.id)))
        .sort(
          (a, b) =>
            order[a.project.status] - order[b.project.status] ||
            Number(b.needsAttention) - Number(a.needsAttention) ||
            (a.project.deadline ?? "9999").localeCompare(b.project.deadline ?? "9999"),
        );
    },

    async getProjectDetail(userId: string, id: string): Promise<ProjectDetail> {
      const project = await requireProject(userId, id);
      const [tasks, waiting] = await Promise.all([
        repos.tasks.list(userId, { projectId: id }),
        repos.waiting.list(userId, { projectId: id, status: ["waiting"] }),
      ]);
      return {
        ...summarizeProject(project, tasks),
        openTasks: tasks.filter((t) => t.status === "open" || t.status === "scheduled"),
        completedTasks: tasks.filter((t) => t.status === "completed"),
        blockedTasks: tasks.filter((t) => t.status === "waiting"),
        waiting,
      };
    },

    async createProject(userId: string, input: CreateProjectInput): Promise<Project> {
      const data = validate(createProjectSchema, input);
      // A brand-new project has no tasks yet, so any Next Action must already
      // exist as one of the user's tasks and gets attached to the project.
      await assertNextActionValid(userId, null, data.nextActionTaskId);
      const project = await repos.projects.insert(userId, {
        name: data.name,
        goal: data.goal ?? null,
        status: data.status,
        lifeArea: data.lifeArea ?? null,
        deadline: data.deadline ?? null,
        nextActionTaskId: data.nextActionTaskId ?? null,
        notes: data.notes ?? null,
      });
      if (data.nextActionTaskId) {
        await repos.tasks.update(userId, data.nextActionTaskId, { projectId: project.id });
      }
      return project;
    },

    async updateProject(userId: string, id: string, input: UpdateProjectInput): Promise<Project> {
      const data = validate(updateProjectSchema, input);
      await requireProject(userId, id);
      await assertNextActionValid(userId, id, data.nextActionTaskId);
      const updated = await repos.projects.update(userId, id, data);
      if (!updated) throw new NotFoundError("Project");
      return updated;
    },

    async setNextAction(userId: string, projectId: string, taskId: string | null): Promise<Project> {
      await requireProject(userId, projectId);
      await assertNextActionValid(userId, projectId, taskId);
      const updated = await repos.projects.update(userId, projectId, { nextActionTaskId: taskId });
      if (!updated) throw new NotFoundError("Project");
      return updated;
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
