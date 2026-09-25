/**
 * In-memory repositories. Used by the test suite and by "demo mode" (when
 * Supabase environment variables are not set), so the dashboard is usable
 * before any backend exists. Data lives only for the life of the process.
 */
import type {
  ConversationMessage,
  Project,
  Reminder,
  Task,
  TaskActivity,
  UserProfile,
  WaitingFor,
} from "@/types/domain";
import { DEFAULT_LIFE_AREAS } from "@/types/domain";
import { matchesTaskFilter } from "../filter";
import type { Repositories } from "../types";

export type MemoryStore = {
  tasks: Task[];
  activity: TaskActivity[];
  projects: Project[];
  waiting: WaitingFor[];
  reminders: Reminder[];
  profiles: UserProfile[];
  conversations: ConversationMessage[];
};

export function emptyStore(): MemoryStore {
  return { tasks: [], activity: [], projects: [], waiting: [], reminders: [], profiles: [], conversations: [] };
}

export function defaultProfile(userId: string, createdAt: string): UserProfile {
  return {
    id: userId,
    timezone: "UTC",
    weekStartsOn: 0,
    morningBriefTime: "07:30",
    eveningReviewEnabled: false,
    weeklyReviewDay: 5,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    preferredDeepWorkStart: null,
    preferredDeepWorkEnd: null,
    preferredWorkoutStart: null,
    preferredWorkoutEnd: null,
    lifeAreas: [...DEFAULT_LIFE_AREAS],
    createdAt,
  };
}

const clone = <T>(value: T): T => structuredClone(value);
const newId = () => crypto.randomUUID();

export function createMemoryRepositories(
  store: MemoryStore = emptyStore(),
  now: () => Date = () => new Date(),
): Repositories {
  const stamp = () => now().toISOString();

  return {
    tasks: {
      async list(userId, filter) {
        return clone(store.tasks.filter((t) => t.userId === userId && matchesTaskFilter(t, filter)));
      },
      async get(userId, id) {
        const task = store.tasks.find((t) => t.userId === userId && t.id === id);
        return task ? clone(task) : null;
      },
      async insert(userId, data) {
        const task: Task = { ...data, id: newId(), userId, createdAt: stamp(), updatedAt: stamp() };
        store.tasks.push(task);
        return clone(task);
      },
      async update(userId, id, patch) {
        const task = store.tasks.find((t) => t.userId === userId && t.id === id);
        if (!task) return null;
        Object.assign(task, patch, { updatedAt: stamp() });
        return clone(task);
      },
      async delete(userId, id) {
        const index = store.tasks.findIndex((t) => t.userId === userId && t.id === id);
        if (index === -1) return false;
        store.tasks.splice(index, 1);
        store.activity = store.activity.filter((a) => a.taskId !== id);
        for (const p of store.projects) if (p.nextActionTaskId === id) p.nextActionTaskId = null;
        return true;
      },
    },

    activity: {
      async add(userId, entry) {
        const row: TaskActivity = { ...entry, id: newId(), userId, createdAt: stamp() };
        store.activity.push(row);
        return clone(row);
      },
      async listForTask(userId, taskId) {
        return clone(
          store.activity
            .filter((a) => a.userId === userId && a.taskId === taskId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      },
    },

    projects: {
      async list(userId, filter) {
        return clone(
          store.projects.filter(
            (p) => p.userId === userId && (!filter?.status || filter.status.includes(p.status)),
          ),
        );
      },
      async get(userId, id) {
        const project = store.projects.find((p) => p.userId === userId && p.id === id);
        return project ? clone(project) : null;
      },
      async insert(userId, data) {
        const project: Project = { ...data, id: newId(), userId, createdAt: stamp(), updatedAt: stamp() };
        store.projects.push(project);
        return clone(project);
      },
      async update(userId, id, patch) {
        const project = store.projects.find((p) => p.userId === userId && p.id === id);
        if (!project) return null;
        Object.assign(project, patch, { updatedAt: stamp() });
        return clone(project);
      },
    },

    waiting: {
      async list(userId, filter) {
        return clone(
          store.waiting.filter(
            (w) =>
              w.userId === userId &&
              (!filter?.status || filter.status.includes(w.status)) &&
              (!filter?.projectId || w.projectId === filter.projectId),
          ),
        );
      },
      async get(userId, id) {
        const item = store.waiting.find((w) => w.userId === userId && w.id === id);
        return item ? clone(item) : null;
      },
      async insert(userId, data) {
        const item: WaitingFor = { ...data, id: newId(), userId, createdAt: stamp() };
        store.waiting.push(item);
        return clone(item);
      },
      async update(userId, id, patch) {
        const item = store.waiting.find((w) => w.userId === userId && w.id === id);
        if (!item) return null;
        Object.assign(item, patch);
        return clone(item);
      },
    },

    reminders: {
      async list(userId, filter) {
        return clone(
          store.reminders.filter(
            (r) => r.userId === userId && (!filter?.status || filter.status.includes(r.status)),
          ),
        );
      },
      async insert(userId, data) {
        const reminder: Reminder = { ...data, id: newId(), userId, createdAt: stamp() };
        store.reminders.push(reminder);
        return clone(reminder);
      },
    },

    profiles: {
      async get(userId) {
        const profile = store.profiles.find((p) => p.id === userId);
        return profile ? clone(profile) : null;
      },
      async findByPhone(phoneNumber) {
        const profile = store.profiles.find((p) => p.phoneNumber === phoneNumber);
        return profile ? clone(profile) : null;
      },
      async update(userId, patch) {
        let profile = store.profiles.find((p) => p.id === userId);
        if (!profile) {
          profile = defaultProfile(userId, stamp());
          store.profiles.push(profile);
        }
        Object.assign(profile, patch);
        return clone(profile);
      },
    },

    conversations: {
      async insert(userId, data) {
        if (data.externalId && store.conversations.some((m) => m.externalId === data.externalId)) {
          throw new Error("duplicate external_id");
        }
        const row: ConversationMessage = { ...data, id: newId(), userId, createdAt: stamp() };
        store.conversations.push(row);
        return clone(row);
      },
      async update(userId, id, patch) {
        const row = store.conversations.find((m) => m.userId === userId && m.id === id);
        if (row) Object.assign(row, patch);
      },
      async findByExternalId(externalId) {
        const row = store.conversations.find((m) => m.externalId === externalId);
        return row ? clone(row) : null;
      },
      async listRecent(userId, limit) {
        return clone(
          store.conversations
            .filter((m) => m.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit),
        );
      },
    },
  };
}
