/**
 * No-key fallback responder. Without OPENAI_API_KEY the app still handles the
 * core Phase 3 flows with simple patterns, through the same validated tools:
 *
 *   "Call doctor tomorrow"            → createTask
 *   "What do I have tomorrow?"        → searchTasks by day
 *   "I'm done with the doctor"        → searchTasks + completeTask
 *   "Move it to Friday"               → updateTask (it = last task mentioned)
 *
 * Anything it doesn't understand gets a clear "I didn't understand" reply
 * rather than a guess.
 */
import type { ConversationMessage, ConversationMetadata, PendingAction } from "@/types/domain";
import { resolveRelativeDate, todayIn } from "@/lib/dates";
import type { Responder, ResponderResult } from "@/services/whatsapp-service";
import { executeTool, type TaskSummary, type ToolContext } from "./tools";
import { capitalize, dayPhrase, taskLine, whichOne } from "./format";

const DAY_WORDS =
  "today|tonight|tomorrow|day after tomorrow|next week|this week|end of (?:the )?week|in (?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?)|(?:next |this |on )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)";
const DAY_RE = new RegExp(`\\b(?:on |by |for )?(${DAY_WORDS})\\b`, "i");

const ACTION_VERBS = new Set(
  "call send book buy email pay check talk write finish pick schedule fix clean order review submit text meet go get start prepare read ask cancel renew return update plan make visit drop file sign reply contact message print collect".split(
    " ",
  ),
);

const LEAD_INS = [
  /^(?:please\s+)?remind me(?:\s+(?:on|by)\s+\w+)?\s+(?:to\s+)?/i,
  /^(?:i\s+)?(?:need|have|want|got)\s+to\s+/i,
  /^(?:don'?t forget|remember)\s+to\s+/i,
  /^i\s+(?:should|must)\s+/i,
  /^(?:add|create)(?:\s+a)?\s+task(?:\s+to)?:?\s+/i,
];

export type RulesDeps = { buildContext: (userId: string) => Promise<ToolContext> };

type Parsed =
  | { kind: "greeting" }
  | { kind: "choice"; index: number }
  | { kind: "addAnyway" }
  | { kind: "show"; day: string }
  | { kind: "complete"; target: string }
  | { kind: "move"; target: string; day: string }
  | { kind: "create"; items: { title: string; day: string | null }[] }
  | { kind: "unknown" };

function stripDay(text: string): { rest: string; day: string | null } {
  const m = text.match(DAY_RE);
  if (!m) return { rest: text, day: null };
  const rest = (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").trim();
  return { rest, day: m[1].toLowerCase() };
}

function cleanTitle(raw: string): string {
  let t = raw.trim().replace(/[.!]+$/, "").replace(/^(?:and|then|also)\s+/i, "");
  for (const re of LEAD_INS) t = t.replace(re, "");
  return capitalize(t.trim());
}

/** Splits "call the doctor and send Ozi the document" but not "buy bread and milk". */
function splitActions(text: string): string[] {
  const parts = text.split(/\s*(?:,\s*(?:and\s+)?|\s+and\s+)\s*/i);
  const out: string[] = [];
  for (const p of parts) {
    const first = p.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (out.length > 0 && !ACTION_VERBS.has(first)) out[out.length - 1] += ` and ${p}`;
    else out.push(p);
  }
  return out;
}

export function parseMessage(input: string): Parsed {
  const text = input.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase().replace(/[?!.]+$/, "");

  if (/^(hi|hello|hey|help|thanks|thank you|ok|okay|👍)$/.test(lower)) return { kind: "greeting" };
  if (/^(?:yes,?\s*)?(?:add|create)(?: it| another(?: one)?)?(?: anyway)?$/.test(lower) && /anyway|another/.test(lower)) {
    return { kind: "addAnyway" };
  }
  const choice = lower.match(/^(?:number\s+)?(\d)$/);
  if (choice) return { kind: "choice", index: Number(choice[1]) - 1 };

  const show = lower.match(
    /^(?:what(?:'s| is)?(?: do i have| on| due| planned)?|what do i have|show(?: me)?(?: my)?(?: tasks)?|anything)(?: on| for| due)?\s*(.*)$/,
  );
  if (show && (lower.startsWith("what") || lower.startsWith("show") || lower.startsWith("anything"))) {
    const rest = show[1].replace(/^(?:i have|my tasks|tasks)\s*/, "").trim();
    const { day } = stripDay(rest || "today");
    if (day || rest === "") return { kind: "show", day: day ?? "today" };
  }

  const done = lower.match(/^(?:i'?m |i am |i'?ve |i have )?(?:done|finished|completed?)(?:\s+with)?\s*(.*)$/);
  if (done) return { kind: "complete", target: done[1].replace(/^the\s+/, "").trim() };

  const move = lower.match(/^(?:please\s+)?(?:move|push|postpone|reschedule|shift)\s+(.+?)\s+(?:to|until|till|for)\s+(.+)$/);
  if (move) {
    const { day } = stripDay(move[2]);
    if (day) return { kind: "move", target: move[1].replace(/^the\s+/, "").trim(), day };
  }

  if (lower.endsWith("?") || text.endsWith("?")) return { kind: "unknown" };
  const { rest, day } = stripDay(text);
  const items = splitActions(rest)
    .map(cleanTitle)
    .filter((t) => t.split(/\s+/).length >= 2 || ACTION_VERBS.has(t.toLowerCase()));
  if (items.length === 0) return { kind: "unknown" };
  return { kind: "create", items: items.map((title) => ({ title, day })) };
}

const PRONOUN = /^(it|that|this|that one|this one|them)$/;

function lastOutboundMeta(history: ConversationMessage[]): ConversationMetadata {
  return history.find((m) => m.direction === "outbound")?.metadata ?? {};
}

export function createRulesResponder(deps: RulesDeps): Responder {
  return {
    async respond({ user, message, history }): Promise<ResponderResult> {
      const ctx = await deps.buildContext(user.id);
      const today = todayIn(ctx.profile.timezone, ctx.now);
      const meta = lastOutboundMeta(history);
      const parsed = parseMessage(message.text);
      const resolveDay = (phrase: string) =>
        resolveRelativeDate(phrase, { timeZone: ctx.profile.timezone, now: ctx.now, weekStartsOn: ctx.profile.weekStartsOn })?.date ?? null;

      async function complete(task: TaskSummary): Promise<ResponderResult> {
        const r = await executeTool("completeTask", { taskId: task.id }, ctx);
        return r.ok
          ? { reply: "✓ Marked complete.", intent: "COMPLETE_TASK", metadata: { taskIds: [task.id] } }
          : { reply: `I couldn't complete that: ${r.error}`, intent: "COMPLETE_TASK" };
      }

      async function move(task: TaskSummary, date: string): Promise<ResponderResult> {
        const r = await executeTool("updateTask", { taskId: task.id, dueDate: date }, ctx);
        return r.ok
          ? { reply: `✓ Moved to ${dayPhrase(date, today)}.`, intent: "POSTPONE_TASK", metadata: { taskIds: [task.id] } }
          : { reply: `I couldn't move that: ${r.error}`, intent: "POSTPONE_TASK" };
      }

      /** Finds the task a message refers to: "it" → last task mentioned, else by title words. */
      async function findTarget(target: string): Promise<{ one?: TaskSummary; many?: TaskSummary[] }> {
        if (!target || PRONOUN.test(target)) {
          // The open tasks named in the last reply; several means ask which.
          const ids = meta.taskIds ?? [];
          if (ids.length === 0) return {};
          const r = await executeTool("searchTasks", { status: "open", limit: 20 }, ctx);
          const open = r.ok ? (r.data.tasks as TaskSummary[]) : [];
          const found = ids.map((id) => open.find((t) => t.id === id)).filter((t): t is TaskSummary => !!t);
          return found.length === 1 ? { one: found[0] } : found.length > 1 ? { many: found } : {};
        }
        const r = await executeTool("searchTasks", { query: target, limit: 5 }, ctx);
        const tasks = r.ok ? (r.data.tasks as TaskSummary[]) : [];
        return tasks.length === 1 ? { one: tasks[0] } : tasks.length > 1 ? { many: tasks } : {};
      }

      const ask = (tasks: TaskSummary[], pending: PendingAction, intent: string): ResponderResult => ({
        reply: whichOne(tasks, today),
        intent,
        metadata: { choiceTaskIds: tasks.map((t) => t.id), pending },
      });

      switch (parsed.kind) {
        case "greeting":
          return {
            reply: "Hi. Tell me what you need to do, e.g. \"Call the doctor tomorrow\". Ask \"What do I have today?\" to see your list.",
            intent: "GENERAL_CHAT",
          };

        case "addAnyway": {
          const pending = meta.pending;
          if (pending?.action !== "create") return { reply: "Add what?", intent: "CREATE_TASK" };
          const r = await executeTool(
            "createTask",
            { title: pending.title, dueDate: pending.dueDate ?? undefined, allowDuplicate: true },
            ctx,
          );
          if (!r.ok) return { reply: `I couldn't add that: ${r.error}`, intent: "CREATE_TASK" };
          const t = r.data.task as TaskSummary;
          return {
            reply: t.dueDate ? `✓ ${capitalize(dayPhrase(t.dueDate, today))}: ${t.title}.` : `✓ Added: ${t.title}.`,
            intent: "CREATE_TASK",
            metadata: { taskIds: [t.id] },
          };
        }

        case "choice": {
          const id = meta.choiceTaskIds?.[parsed.index];
          const pending = meta.pending;
          if (!id || !pending) return { reply: "I'm not sure what that number refers to.", intent: "GENERAL_CHAT" };
          const r = await executeTool("searchTasks", { status: "open", limit: 20 }, ctx);
          const task = r.ok ? (r.data.tasks as TaskSummary[]).find((t) => t.id === id) : undefined;
          if (!task) return { reply: "That task isn't open anymore.", intent: "GENERAL_CHAT" };
          if (pending.action === "complete") return complete(task);
          if (pending.action === "move") return move(task, pending.date);
          return { reply: "I'm not sure what that number refers to.", intent: "GENERAL_CHAT" };
        }

        case "show": {
          const day = resolveDay(parsed.day);
          if (!day) return { reply: "Which day?", intent: "SHOW_TASKS" };
          const r = await executeTool("searchTasks", { date: day, limit: 15 }, ctx);
          const tasks = r.ok ? (r.data.tasks as TaskSummary[]) : [];
          const label = capitalize(dayPhrase(day, today));
          if (tasks.length === 0) return { reply: `Nothing for ${dayPhrase(day, today)}.`, intent: "SHOW_TASKS" };
          return {
            reply: `${label}:\n${tasks.map((t) => taskLine(t, today)).join("\n")}`,
            intent: "SHOW_TASKS",
            metadata: { taskIds: tasks.map((t) => t.id) },
          };
        }

        case "complete": {
          const found = await findTarget(parsed.target);
          if (found.one) return complete(found.one);
          if (found.many) return ask(found.many, { action: "complete" }, "COMPLETE_TASK");
          return {
            reply: parsed.target ? `I couldn't find an open task about "${parsed.target}".` : "Done with which task?",
            intent: "COMPLETE_TASK",
          };
        }

        case "move": {
          const date = resolveDay(parsed.day);
          if (!date) return { reply: "Which day should I move it to?", intent: "POSTPONE_TASK" };
          const found = await findTarget(parsed.target);
          if (found.one) return move(found.one, date);
          if (found.many) return ask(found.many, { action: "move", date }, "POSTPONE_TASK");
          return {
            reply: PRONOUN.test(parsed.target) ? "Move which task?" : `I couldn't find an open task about "${parsed.target}".`,
            intent: "POSTPONE_TASK",
          };
        }

        case "create": {
          const created: TaskSummary[] = [];
          const existing: TaskSummary[] = [];
          for (const item of parsed.items) {
            const isCall = /^(call|phone|ring)\b/i.test(item.title);
            const r = await executeTool(
              "createTask",
              {
                title: item.title,
                dueDate: item.day ?? undefined,
                ...(isCall ? { context: "phone", estimatedMinutes: 15 } : {}),
              },
              ctx,
            );
            if (r.ok) created.push(r.data.task as TaskSummary);
            else if (r.error === "duplicate" && parsed.items.length > 1) existing.push((r.data?.duplicates as TaskSummary[])[0]);
            else if (r.error === "duplicate") {
              const dup = (r.data?.duplicates as TaskSummary[])[0];
              const dueDate = item.day ? resolveDay(item.day) : null;
              return {
                reply: `You already have:\n${dup.title}\nNothing new was added. Reply "add anyway" to create another.`,
                intent: "CREATE_TASK",
                metadata: { taskIds: [dup.id], pending: { action: "create", title: item.title, dueDate } },
              };
            }
          }
          // Similar tasks that already existed are named, never silently dropped.
          const skipped = existing.length
            ? `\nAlready on your list, not added again:\n${existing.map((t) => `• ${t.title}`).join("\n")}`
            : "";
          if (created.length === 0 && existing.length > 0) {
            return {
              reply: `Nothing new was added.${skipped}`,
              intent: "BRAIN_DUMP",
              metadata: { taskIds: existing.map((t) => t.id) },
            };
          }
          if (created.length === 0) return { reply: "I couldn't add that. Try rephrasing it.", intent: "CREATE_TASK" };
          const ids = created.map((t) => t.id);
          const day = created[0].dueDate;
          const sameDay = created.every((t) => t.dueDate === day);
          if (created.length === 1) {
            const t = created[0];
            return {
              reply: (t.dueDate ? `✓ ${capitalize(dayPhrase(t.dueDate, today))}: ${t.title}.` : `✓ Added: ${t.title}.`) + skipped,
              intent: "CREATE_TASK",
              metadata: { taskIds: ids },
            };
          }
          if (created.length === 2 && sameDay && day) {
            return { reply: `✓ Added both for ${dayPhrase(day, today)}.${skipped}`, intent: "BRAIN_DUMP", metadata: { taskIds: ids } };
          }
          return {
            reply: `✓ Captured ${created.length} items:\n${created.map((t) => taskLine(t, today, true)).join("\n")}${skipped}`,
            intent: "BRAIN_DUMP",
            metadata: { taskIds: ids },
          };
        }

        case "unknown":
          return {
            reply: "I didn't catch that. Try \"Call the doctor tomorrow\", \"What do I have today?\" or \"Done with the doctor\".",
            intent: "GENERAL_CHAT",
          };
      }
    },
  };
}
