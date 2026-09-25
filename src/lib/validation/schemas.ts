/**
 * Zod schemas for every write into the domain services. The dashboard, the
 * REST API and (from Phase 3) the AI tool layer all validate through these,
 * so there is exactly one definition of "a valid task".
 */
import { z } from "zod";
import {
  ENERGY_LEVELS,
  PRIORITIES,
  PROJECT_STATUSES,
  SOURCES,
  TASK_CONTEXTS,
  TASK_STATUSES,
  WAITING_STATUSES,
} from "@/types/domain";
import { isDayString } from "@/lib/dates";

const day = z
  .string()
  .refine(isDayString, { message: "Expected a date in YYYY-MM-DD format" });
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Expected a time in HH:mm format" });
const id = z.string().min(1);
const optionalText = z.string().trim().max(5000).nullish();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText,
  status: z.enum(TASK_STATUSES).default("open"),
  priority: z.enum(PRIORITIES).default("normal"),
  lifeArea: z.string().trim().max(50).nullish(),
  projectId: id.nullish(),
  dueDate: day.nullish(),
  dueTime: time.nullish(),
  plannedDate: day.nullish(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).nullish(),
  energyLevel: z.enum(ENERGY_LEVELS).nullish(),
  context: z.enum(TASK_CONTEXTS).nullish(),
  source: z.enum(SOURCES).default("dashboard"),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema
  .omit({ source: true })
  .partial()
  .extend({ title: z.string().trim().min(1, "Title is required").max(300).optional() });
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const taskFilterSchema = z.object({
  status: z.array(z.enum(TASK_STATUSES)).optional(),
  projectId: id.optional(),
  lifeArea: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  context: z.enum(TASK_CONTEXTS).optional(),
  dueBefore: day.optional(),
  dueOnOrAfter: day.optional(),
  query: z.string().trim().max(200).optional(),
});
export type TaskFilter = z.infer<typeof taskFilterSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  goal: optionalText,
  status: z.enum(PROJECT_STATUSES).default("active"),
  lifeArea: z.string().trim().max(50).nullish(),
  deadline: day.nullish(),
  nextActionTaskId: id.nullish(),
  notes: optionalText,
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const createWaitingForSchema = z.object({
  person: z.string().trim().min(1, "Person is required").max(120),
  topic: z.string().trim().min(1, "Topic is required").max(300),
  description: optionalText,
  expectedBy: day.nullish(),
  projectId: id.nullish(),
});
export type CreateWaitingForInput = z.input<typeof createWaitingForSchema>;

export const updateWaitingForSchema = createWaitingForSchema.partial().extend({
  status: z.enum(WAITING_STATUSES).optional(),
});
export type UpdateWaitingForInput = z.input<typeof updateWaitingForSchema>;

export const createReminderSchema = z
  .object({
    taskId: id.nullish(),
    waitingForId: id.nullish(),
    remindAt: z.iso.datetime({ offset: true }),
  })
  .refine((r) => !(r.taskId && r.waitingForId), {
    message: "A reminder links to a task or a waiting item, not both",
  });
export type CreateReminderInput = z.input<typeof createReminderSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().max(100).optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +972501234567")
    .optional()
    .or(z.literal("")),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone")
    .optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
  morningBriefTime: time.optional(),
  eveningReviewEnabled: z.boolean().optional(),
  weeklyReviewDay: z.number().int().min(0).max(6).optional(),
  workingHoursStart: time.optional(),
  workingHoursEnd: time.optional(),
  preferredDeepWorkStart: time.nullish(),
  preferredDeepWorkEnd: time.nullish(),
  preferredWorkoutStart: time.nullish(),
  preferredWorkoutEnd: time.nullish(),
  lifeAreas: z.array(z.string().trim().min(1).max(50)).min(1).max(30).optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
