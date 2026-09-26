/**
 * The AI tool layer (brief §15): LLM → validated tool → domain service → DB.
 * The model never touches the database; every argument is validated with Zod
 * and every result says whether the action really happened.
 *
 * The no-key fallback (rules.ts) calls these same tools, so both paths share
 * one set of behaviours.
 */
import { z } from "zod";
import type { Task, UserProfile } from "@/types/domain";
import { PRIORITIES, TASK_CONTEXTS } from "@/types/domain";
import type { Services } from "@/services";
import { effectiveDate } from "@/services/task-service";
import { NotFoundError, ValidationError } from "@/services/errors";
import { isDayString, resolveRelativeDate } from "@/lib/dates";

export type ToolContext = {
  userId: string;
  profile: UserProfile;
  services: Services;
  now: Date;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string | null;
  dueTime: string | null;
  plannedDate: string | null;
  estimatedMinutes: number | null;
};

export type ToolResult =
  | { ok: true; mutated: boolean; taskIds: string[]; data: Record<string, unknown> }
  | { ok: false; mutated: false; taskIds: string[]; error: string; data?: Record<string, unknown> };

export const summarizeTask = (t: Task): TaskSummary => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate ?? null,
  dueTime: t.dueTime ?? null,
  plannedDate: t.plannedDate ?? null,
  estimatedMinutes: t.estimatedMinutes ?? null,
});

/** Accepts "2026-09-28" or a relative phrase ("tomorrow", "Sunday", "next week"). */
const dateArg = z.string().trim().min(1).describe(
  "A date as YYYY-MM-DD or a relative phrase such as today, tomorrow, tonight, Sunday, next week, end of week, in two weeks.",
);

function resolveDate(input: string, ctx: ToolContext): { date: string; time?: string } {
  if (isDayString(input)) return { date: input };
  const resolved = resolveRelativeDate(input, {
    timeZone: ctx.profile.timezone,
    now: ctx.now,
    weekStartsOn: ctx.profile.weekStartsOn,
  });
  if (!resolved) throw new ValidationError(`Couldn't understand the date "${input}"`);
  return resolved;
}

const createTaskArgs = z.object({
  title: z.string().trim().min(1).max(300).describe("A concrete action, e.g. 'Call the doctor'."),
  dueDate: dateArg.optional(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("HH:mm, only if the user gave a time."),
  estimatedMinutes: z.number().int().positive().max(1440).optional(),
  lifeArea: z.string().optional(),
  context: z.enum(TASK_CONTEXTS).optional(),
  priority: z.enum(PRIORITIES).optional(),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe("Only true after the user confirmed they want another task similar to an existing one."),
});

const searchTasksArgs = z.object({
  query: z.string().trim().max(200).optional().describe("Words from the task title."),
  date: dateArg.optional().describe("Only tasks due or planned on this day."),
  status: z.enum(["open", "completed", "all"]).optional().describe("Defaults to open."),
  limit: z.number().int().min(1).max(20).optional(),
});

const completeTaskArgs = z.object({ taskId: z.string().min(1) });

const updateTaskArgs = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  dueDate: dateArg.optional().describe("New deadline. Use this to postpone or move a task."),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  priority: z.enum(PRIORITIES).optional(),
  estimatedMinutes: z.number().int().positive().max(1440).optional(),
  status: z.enum(["open", "someday", "cancelled"]).optional(),
});

const OPEN = ["open", "scheduled", "waiting"] as const;

function scoreMatch(title: string, query: string): number {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const t = title.toLowerCase();
  return words.filter((w) => t.includes(w) || t.includes(w.replace(/s$/, ""))).length / words.length;
}

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
};

const define = <S extends z.ZodType>(t: ToolDef<S>) => t;

export const TOOLS = {
  createTask: define({
    name: "createTask",
    description:
      "Create one task. Returns the created task, or duplicates if a similar open task already exists (then ask the user whether to update it or create another).",
    schema: createTaskArgs,
    async run(args, ctx) {
      const due = args.dueDate ? resolveDate(args.dueDate, ctx) : undefined;
      const result = await ctx.services.tasks.createTask(
        ctx.userId,
        {
          title: args.title,
          dueDate: due?.date ?? null,
          dueTime: args.dueTime ?? due?.time ?? null,
          estimatedMinutes: args.estimatedMinutes ?? null,
          lifeArea: args.lifeArea && ctx.profile.lifeAreas.includes(args.lifeArea) ? args.lifeArea : null,
          context: args.context ?? null,
          priority: args.priority ?? "normal",
          source: "whatsapp",
        },
        { allowDuplicate: args.allowDuplicate ?? false },
      );
      if (!result.ok) {
        return {
          ok: false,
          mutated: false,
          taskIds: result.duplicates.map((t) => t.id),
          error: "duplicate",
          data: { duplicates: result.duplicates.map(summarizeTask) },
        };
      }
      return { ok: true, mutated: true, taskIds: [result.task.id], data: { task: summarizeTask(result.task) } };
    },
  }),

  searchTasks: define({
    name: "searchTasks",
    description:
      "Find the user's tasks by words in the title and/or by day. Use before completing or updating a task, and to answer questions like 'what do I have tomorrow?'.",
    schema: searchTasksArgs,
    async run(args, ctx) {
      const status = args.status ?? "open";
      const all = await ctx.services.tasks.listTasks(ctx.userId, {
        status: status === "open" ? [...OPEN] : status === "completed" ? ["completed"] : undefined,
      });
      const day = args.date ? resolveDate(args.date, ctx).date : undefined;
      let matches = day ? all.filter((t) => effectiveDate(t) === day) : all;
      if (args.query) {
        matches = matches
          .map((t) => ({ t, s: scoreMatch(t.title, args.query!) }))
          .filter((m) => m.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((m) => m.t);
      } else {
        matches.sort((a, b) => (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"));
      }
      const limited = matches.slice(0, args.limit ?? 10);
      return {
        ok: true,
        mutated: false,
        taskIds: limited.map((t) => t.id),
        data: { date: day ?? null, count: matches.length, tasks: limited.map(summarizeTask) },
      };
    },
  }),

  completeTask: define({
    name: "completeTask",
    description: "Mark a task complete by id. Only call with an id from searchTasks or the context.",
    schema: completeTaskArgs,
    async run(args, ctx) {
      const task = await ctx.services.tasks.completeTask(ctx.userId, args.taskId, "whatsapp");
      return { ok: true, mutated: true, taskIds: [task.id], data: { task: summarizeTask(task) } };
    },
  }),

  updateTask: define({
    name: "updateTask",
    description: "Change a task by id: move/postpone its date, rename it, change priority, duration or time.",
    schema: updateTaskArgs,
    async run(args, ctx) {
      const due = args.dueDate ? resolveDate(args.dueDate, ctx) : undefined;
      const current = await ctx.services.tasks.getTask(ctx.userId, args.taskId);
      const task = await ctx.services.tasks.updateTask(
        ctx.userId,
        args.taskId,
        {
          title: args.title,
          dueDate: due?.date,
          dueTime: args.dueTime ?? due?.time,
          // Moving a task moves the day it happens; a stale plan would hide it.
          plannedDate: due && current.plannedDate ? null : undefined,
          priority: args.priority,
          estimatedMinutes: args.estimatedMinutes,
          status: args.status,
        },
        "whatsapp",
      );
      return { ok: true, mutated: true, taskIds: [task.id], data: { task: summarizeTask(task) } };
    },
  }),
};

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

/** Validates raw (model-produced) arguments and runs the tool. Never throws. */
export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = (TOOLS as Record<string, ToolDef<z.ZodType>>)[name];
  if (!tool) return { ok: false, mutated: false, taskIds: [], error: `Unknown tool ${name}` };
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      mutated: false,
      taskIds: [],
      error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    };
  }
  try {
    return await tool.run(parsed.data, ctx);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { ok: false, mutated: false, taskIds: [], error: error.message };
    }
    throw error;
  }
}

/** OpenAI function-calling definitions generated from the Zod schemas. */
export function toolDefinitions() {
  return TOOL_NAMES.map((name) => {
    const { description, schema } = TOOLS[name];
    const parameters = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
    delete parameters.$schema;
    return { type: "function" as const, function: { name, description, parameters } };
  });
}
