/**
 * The AI orchestrator (brief §14-§18): message + context → LLM → validated
 * tools → short reply. The model only ever proposes tool calls; executeTool
 * validates them and runs the domain services, so it never writes to the
 * database itself.
 *
 * Safety rules enforced here, not left to the prompt:
 * - a reply that claims an action ("✓ …") with no successful write is
 *   replaced by the failure message;
 * - an LLM or network error throws, so the WhatsApp pipeline stores the
 *   message as failed and answers "I couldn't process that correctly".
 */
import type { ConversationMessage, ConversationMetadata } from "@/types/domain";
import { addDays, todayIn, weekdayOf } from "@/lib/dates";
import { effectiveDate } from "@/services/task-service";
import type { Responder, ResponderResult } from "@/services/whatsapp-service";
import { executeTool, summarizeTask, toolDefinitions, type TaskSummary, type ToolContext, type ToolResult } from "./tools";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmRequest = { messages: ChatMessage[]; tools: ReturnType<typeof toolDefinitions> };
export type LlmResponse = { content: string | null; toolCalls: ToolCall[] };

/** The one seam to the model provider; tests pass a scripted fake. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

/** OpenAI Chat Completions over fetch (no SDK dependency). */
export function createOpenAIClient(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): LlmClient {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;
  return {
    async complete({ messages, tools }) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify({
            model: options.model ?? DEFAULT_OPENAI_MODEL,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        });
      } catch (error) {
        throw new AiError(`OpenAI request failed: ${(error as Error).name}`);
      }
      if (!res.ok) {
        // The body can echo request details; keep only the status and error code.
        const code = await res
          .json()
          .then((b: { error?: { code?: string; type?: string } }) => b.error?.code ?? b.error?.type ?? "")
          .catch(() => "");
        throw new AiError(`OpenAI returned ${res.status}${code ? ` (${code})` : ""}`);
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      };
      const message = body.choices?.[0]?.message;
      if (!message) throw new AiError("OpenAI returned no message");
      return { content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
    },
  };
}

const MAX_STEPS = 6;
const HISTORY_LIMIT = 12;

export function systemPrompt(input: {
  today: string;
  weekday: string;
  timeZone: string;
  name: string | null;
  upcoming: TaskSummary[];
  referenced: TaskSummary[];
  lastChoices: TaskSummary[];
}): string {
  const list = (tasks: TaskSummary[], numbered = false) =>
    tasks.length === 0
      ? "(none)"
      : tasks
          .map((t, i) => {
            const day = t.plannedDate ?? t.dueDate;
            const when = [day, t.dueTime].filter(Boolean).join(" ");
            return `${numbered ? `${i + 1}. ` : "- "}[${t.id}] ${t.title}${when ? ` (${when})` : ""}`;
          })
          .join("\n");

  return `You are ${input.name ? `${input.name}'s` : "the user's"} personal Chief of Staff on WhatsApp. You capture tasks, answer what is on their plate, and update tasks, using only the tools provided.

Today is ${input.weekday} ${input.today}, time zone ${input.timeZone}.

Rules:
- Keep replies short: one line when possible, never more than a few. Plain text, no markdown headings.
- Turn vague input into concrete tasks ("doctor tomorrow" -> "Call the doctor", due tomorrow).
- A message with several actions becomes several createTask calls.
- For dates, pass the user's phrase ("tomorrow", "Friday", "next week") or YYYY-MM-DD. Do not calculate dates yourself.
- To complete, move or change a task, use an id from the context below or from searchTasks. Never invent ids.
- "it", "that" and similar refer to the most recently referenced task.
- If several tasks could match, do not guess. Reply "Which one?" followed by a numbered list, one per line, in the order searchTasks returned them. A reply of just a number picks from the last numbered list below.
- If createTask reports a duplicate, do not create another. Tell the user they already have it and ask whether to update it or add another; only pass allowDuplicate after they say to add another.
- Start a confirmation with "✓" only after the tool call succeeded. Never say something was added, moved or completed unless a tool result says so. If a tool fails, say what did not happen.
- Confirmation style: "✓ Tomorrow: Call the doctor." / "✓ Added both for tomorrow." / "✓ Marked complete." / "✓ Moved to Friday."
- If you cannot tell what the user wants, ask one short question.

Recently referenced tasks (newest first):
${list(input.referenced)}

Last numbered list sent to the user:
${list(input.lastChoices, true)}

Open tasks that are overdue or due in the next 7 days:
${list(input.upcoming)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Maps the tool calls that ran to one intent from brief §17. */
export function deriveIntent(calls: { name: string; args: Record<string, unknown>; result: ToolResult }[]): string {
  const created = calls.filter((c) => c.name === "createTask");
  if (created.filter((c) => c.result.ok).length > 1) return "BRAIN_DUMP";
  if (created.length > 0) return "CREATE_TASK";
  if (calls.some((c) => c.name === "completeTask")) return "COMPLETE_TASK";
  const updates = calls.filter((c) => c.name === "updateTask");
  if (updates.some((c) => c.args.dueDate !== undefined)) return "POSTPONE_TASK";
  if (updates.length > 0) return "UPDATE_TASK";
  if (calls.some((c) => c.name === "searchTasks")) return "SHOW_TASKS";
  return "GENERAL_CHAT";
}

const NUMBERED_LIST = /^\s*1[.)]\s/m;

export function createAiResponder(deps: {
  llm: LlmClient;
  buildContext: (userId: string) => Promise<ToolContext>;
}): Responder {
  return {
    async respond({ user, message, history }): Promise<ResponderResult> {
      const ctx = await deps.buildContext(user.id);
      const today = todayIn(ctx.profile.timezone, ctx.now);

      const open = await ctx.services.tasks.listTasks(ctx.userId, { status: ["open", "scheduled", "waiting"] });
      const byId = new Map(open.map((t) => [t.id, summarizeTask(t)]));
      const horizon = addDays(today, 7);
      const upcoming = open
        .filter((t) => {
          const day = effectiveDate(t);
          return day !== null && day !== undefined && day <= horizon;
        })
        .slice(0, 30)
        .map(summarizeTask);
      const lastMeta: ConversationMetadata = history.find((m) => m.direction === "outbound")?.metadata ?? {};
      const referencedIds = [...new Set(history.flatMap((m) => m.metadata?.taskIds ?? []))];
      const pick = (ids: string[] = []) => ids.map((id) => byId.get(id)).filter((t): t is TaskSummary => !!t);

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: systemPrompt({
            today,
            weekday: WEEKDAYS[weekdayOf(today)],
            timeZone: ctx.profile.timezone,
            name: ctx.profile.name ?? null,
            upcoming,
            referenced: pick(referencedIds).slice(0, 5),
            lastChoices: pick(lastMeta.choiceTaskIds),
          }),
        },
        ...toChatHistory(history),
        { role: "user", content: message.text },
      ];

      const calls: { name: string; args: Record<string, unknown>; result: ToolResult }[] = [];
      const tools = toolDefinitions();
      let reply: string | null = null;

      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await deps.llm.complete({ messages, tools });
        if (response.toolCalls.length === 0) {
          reply = response.content?.trim() || null;
          break;
        }
        messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls });
        for (const call of response.toolCalls) {
          let args: Record<string, unknown>;
          let result: ToolResult;
          try {
            args = JSON.parse(call.function.arguments || "{}");
            result = await executeTool(call.function.name, args, ctx);
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            args = {};
            result = { ok: false, mutated: false, taskIds: [], error: "Arguments were not valid JSON" };
          }
          calls.push({ name: call.function.name, args, result });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }

      if (reply === null) throw new AiError("The model did not produce a reply");

      const mutatedIds = calls.filter((c) => c.result.ok && c.result.mutated).flatMap((c) => c.result.taskIds);
      if (reply.includes("✓") && mutatedIds.length === 0) {
        // The model claimed an action that never happened. Never pass that on.
        throw new AiError("Reply claimed an action with no successful tool call");
      }

      const searches = calls.filter((c) => c.name === "searchTasks" && c.result.ok);
      const lastSearchIds = searches.at(-1)?.result.taskIds ?? [];
      const duplicateIds = calls.filter((c) => c.result.ok === false && c.result.error === "duplicate").flatMap((c) => c.result.taskIds);
      const metadata: ConversationMetadata = {};
      const taskIds = mutatedIds.length > 0 ? mutatedIds : duplicateIds.length > 0 ? duplicateIds : lastSearchIds.slice(0, 10);
      if (taskIds.length > 0) metadata.taskIds = [...new Set(taskIds)];
      if (NUMBERED_LIST.test(reply) && lastSearchIds.length > 0) metadata.choiceTaskIds = lastSearchIds;

      return { reply, intent: deriveIntent(calls), metadata };
    },
  };
}

/** Earlier turns as plain chat, oldest first. Tool traffic is not replayed. */
function toChatHistory(history: ConversationMessage[]): ChatMessage[] {
  return history
    .slice(0, HISTORY_LIMIT)
    .filter((m) => (m.body ?? m.transcription ?? "").trim() !== "")
    .reverse()
    .map((m) =>
      m.direction === "inbound"
        ? { role: "user" as const, content: m.transcription ?? m.body ?? "" }
        : { role: "assistant" as const, content: m.body ?? "" },
    );
}
