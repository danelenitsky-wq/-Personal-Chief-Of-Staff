/**
 * Row <-> domain mapping for Supabase. SQL uses snake_case; the domain uses
 * camelCase. Postgres `time` columns come back as HH:mm:ss and are trimmed.
 */
import type {
  Project,
  Reminder,
  Task,
  TaskActivity,
  UserProfile,
  WaitingFor,
} from "@/types/domain";
import type { ProfilePatch } from "../types";

type Row = Record<string, unknown>;

const hhmm = (value: unknown): string | null =>
  typeof value === "string" ? value.slice(0, 5) : null;

/** Converts a camelCase patch into snake_case columns, skipping undefined. */
export function toColumns(patch: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    row[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  return row;
}

export function toTask(row: Row): Task {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    priorityScore: row.priority_score == null ? undefined : Number(row.priority_score),
    lifeArea: (row.life_area as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    dueDate: (row.due_date as string | null) ?? null,
    dueTime: hhmm(row.due_time),
    plannedDate: (row.planned_date as string | null) ?? null,
    estimatedMinutes: (row.estimated_minutes as number | null) ?? null,
    energyLevel: (row.energy_level as Task["energyLevel"]) ?? null,
    context: (row.context as Task["context"]) ?? null,
    postponeCount: (row.postpone_count as number) ?? 0,
    source: row.source as Task["source"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export function toActivity(row: Row): TaskActivity {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    taskId: row.task_id as string,
    kind: row.kind as TaskActivity["kind"],
    detail: (row.detail as string | null) ?? null,
    source: row.source as TaskActivity["source"],
    createdAt: row.created_at as string,
  };
}

export function toProject(row: Row): Project {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    status: row.status as Project["status"],
    lifeArea: (row.life_area as string | null) ?? null,
    deadline: (row.deadline as string | null) ?? null,
    nextActionTaskId: (row.next_action_task_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function toWaitingFor(row: Row): WaitingFor {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    person: row.person as string,
    topic: row.topic as string,
    description: (row.description as string | null) ?? null,
    expectedBy: (row.expected_by as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    status: row.status as WaitingFor["status"],
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export function toReminder(row: Row): Reminder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    taskId: (row.task_id as string | null) ?? null,
    waitingForId: (row.waiting_for_id as string | null) ?? null,
    remindAt: row.remind_at as string,
    status: row.status as Reminder["status"],
    createdAt: row.created_at as string,
  };
}

export function toProfile(row: Row): UserProfile {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? undefined,
    phoneNumber: (row.phone_number as string | null) ?? undefined,
    timezone: row.timezone as string,
    weekStartsOn: (row.week_starts_on as 0 | 1) ?? 0,
    morningBriefTime: hhmm(row.morning_brief_time) ?? undefined,
    eveningReviewEnabled: Boolean(row.evening_review_enabled),
    weeklyReviewDay: (row.weekly_review_day as number) ?? 5,
    workingHoursStart: hhmm(row.working_hours_start) ?? undefined,
    workingHoursEnd: hhmm(row.working_hours_end) ?? undefined,
    preferredDeepWorkStart: hhmm(row.preferred_deep_work_start),
    preferredDeepWorkEnd: hhmm(row.preferred_deep_work_end),
    preferredWorkoutStart: hhmm(row.preferred_workout_start),
    preferredWorkoutEnd: hhmm(row.preferred_workout_end),
    lifeAreas: (row.life_areas as string[]) ?? [],
    createdAt: row.created_at as string,
  };
}

export function profileToColumns(patch: ProfilePatch): Row {
  const row = toColumns(patch as Record<string, unknown>);
  if ("phone_number" in row && row.phone_number === "") row.phone_number = null;
  return row;
}
