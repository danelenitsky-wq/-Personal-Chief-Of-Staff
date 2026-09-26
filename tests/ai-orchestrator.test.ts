import { describe, expect, it } from "vitest";
import { AiError, createOpenAIClient, type LlmClient, type LlmRequest, type LlmResponse, type ToolCall } from "@/lib/ai/orchestrator";
import { executeTool, toolDefinitions, type ToolContext } from "@/lib/ai/tools";
import { REPLIES } from "@/services/whatsapp-service";
import { chat } from "./ai-helpers";
import { NOW, setup, USER_A, USER_B } from "./helpers";

const TOMORROW = "2026-09-24";

let callSeq = 0;
const call = (name: string, args: unknown): ToolCall => ({
  id: `call_${++callSeq}`,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

/** A fake model that plays back scripted turns and records every request. */
function scripted(...turns: ((req: LlmRequest) => LlmResponse | Promise<LlmResponse>)[]) {
  const requests: LlmRequest[] = [];
  const llm: LlmClient = {
    async complete(req) {
      requests.push(structuredClone(req));
      const next = turns.shift();
      if (!next) throw new Error("script exhausted");
      return next(req);
    },
  };
  return { llm, requests };
}
const tools = (...calls: ToolCall[]) => () => ({ content: null, toolCalls: calls });
const say = (content: string) => () => ({ content, toolCalls: [] });
const lastToolResult = (req: LlmRequest) => JSON.parse(req.messages.at(-1)!.content as string);

describe("AI orchestrator", () => {
  it("uses the model when a key or client is provided", () => {
    expect(chat({ llm: scripted().llm }).mode).toBe("openai");
  });

  it("Scenario A: two createTask calls, confirmed only after they succeed", async () => {
    const { llm, requests } = scripted(
      tools(call("createTask", { title: "Call the doctor", dueDate: "tomorrow" }), call("createTask", { title: "Send Ozi the document", dueDate: "tomorrow" })),
      say("✓ Added both for tomorrow."),
    );
    const c = chat({ llm });
    expect(await c.say("Tomorrow I need to call the doctor and send Ozi the document")).toBe("✓ Added both for tomorrow.");
    expect(c.tasks().map((t) => [t.title, t.dueDate, t.source])).toEqual([
      ["Call the doctor", TOMORROW, "whatsapp"],
      ["Send Ozi the document", TOMORROW, "whatsapp"],
    ]);
    expect(c.inbound()[0].intent).toBe("BRAIN_DUMP");
    expect(c.store.conversations.at(-1)!.metadata?.taskIds).toEqual(c.tasks().map((t) => t.id));

    const system = requests[0].messages[0].content as string;
    expect(system).toContain("Today is Wednesday 2026-09-23, time zone Asia/Jerusalem.");
    expect(requests[0].tools.map((t) => t.function.name)).toEqual(["createTask", "searchTasks", "completeTask", "updateTask"]);
    expect(requests[1].messages.filter((m) => m.role === "tool")).toHaveLength(2);
  });

  it("Scenario C and 'move it': resolves the task from context and search", async () => {
    const seed = scripted(tools(call("createTask", { title: "Send Ozi the document", dueDate: "tomorrow" })), say("✓ Tomorrow: Send Ozi the document."));
    const c = chat({ llm: seed.llm });
    await c.say("Send Ozi the document tomorrow");
    const id = c.tasks()[0].id;

    // The follow-up request must carry the task and its id as recent context.
    const next = scripted(
      (req) => {
        expect(req.messages[0].content).toContain(`[${id}] Send Ozi the document`);
        expect(req.messages.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
        return { content: null, toolCalls: [call("updateTask", { taskId: id, dueDate: "friday" })] };
      },
      say("✓ Moved to Friday."),
      tools(call("searchTasks", { query: "Ozi" })),
      (req) => {
        expect(lastToolResult(req).taskIds).toEqual([id]);
        return { content: null, toolCalls: [call("completeTask", { taskId: id })] };
      },
      say("✓ Marked complete."),
    );
    Object.assign(seed.llm, next.llm);
    expect(await c.say("Move it to Friday")).toBe("✓ Moved to Friday.");
    expect(c.tasks()[0].dueDate).toBe("2026-09-25");
    expect(await c.say("Done with Ozi")).toBe("✓ Marked complete.");
    expect(c.tasks()[0].status).toBe("completed");
    expect(c.inbound().map((m) => m.intent)).toEqual(["CREATE_TASK", "POSTPONE_TASK", "COMPLETE_TASK"]);
  });

  it("remembers a numbered 'Which one?' list for the next message", async () => {
    const { llm, requests } = scripted(
      tools(call("searchTasks", { query: "Dana" })),
      say("Which one?\n1. Email Dana the invoice\n2. Email Dana about the offsite"),
      (req) => {
        expect(req.messages[0].content).toMatch(/Last numbered list sent to the user:\n1\. \[.+\] Email Dana the invoice/);
        return { content: "Okay.", toolCalls: [] };
      },
    );
    const c = chat({ llm });
    await c.services.tasks.createTask(USER_A, { title: "Email Dana the invoice" });
    await c.services.tasks.createTask(USER_A, { title: "Email Dana about the offsite" }, { allowDuplicate: true });
    await c.say("Done with Dana");
    expect(c.store.conversations.at(-1)!.metadata?.choiceTaskIds).toHaveLength(2);
    expect(await c.say("1")).toBe("Okay.");
    expect(requests).toHaveLength(3);
  });

  it("passes a duplicate back to the model instead of creating it", async () => {
    const { llm, requests } = scripted(
      tools(call("createTask", { title: "Call doctor" })),
      say("You already have: Call doctor. Update it or add another?"),
    );
    const c = chat({ llm });
    await c.services.tasks.createTask(USER_A, { title: "Call doctor" });
    expect(await c.say("Call doctor")).toBe("You already have: Call doctor. Update it or add another?");
    expect(c.tasks()).toHaveLength(1);
    expect(lastToolResult(requests[1])).toMatchObject({ ok: false, error: "duplicate" });
  });

  it("truth guard: a ✓ claim with no successful write becomes the failure reply", async () => {
    const c = chat({ llm: scripted(say("✓ Added: Call doctor.")).llm });
    expect(await c.say("Call doctor")).toBe(REPLIES.failure);
    expect(c.tasks()).toHaveLength(0);
    expect(c.inbound()[0].processingStatus).toBe("failed");
  });

  it("truth guard: a failed tool call cannot be reported as done", async () => {
    const { llm, requests } = scripted(tools(call("createTask", { title: "" })), say("✓ Added."));
    const c = chat({ llm });
    expect(await c.say("add it")).toBe(REPLIES.failure);
    expect(lastToolResult(requests[1]).error).toMatch(/^Invalid arguments: title/);
    expect(c.tasks()).toHaveLength(0);
  });

  it("an AI failure stores the message and asks the user to rephrase", async () => {
    const llm: LlmClient = { complete: async () => { throw new AiError("OpenAI returned 500"); } };
    const c = chat({ llm });
    expect(await c.say("Call doctor tomorrow")).toBe(REPLIES.failure);
    expect(c.inbound()[0]).toMatchObject({ body: "Call doctor tomorrow", processingStatus: "failed", error: "OpenAI returned 500" });
  });

  it("stops a model that keeps calling tools", async () => {
    const loop = Array.from({ length: 6 }, () => tools(call("searchTasks", {})));
    const c = chat({ llm: scripted(...loop).llm });
    expect(await c.say("hmm")).toBe(REPLIES.failure);
  });
});

describe("AI tools", () => {
  const ctxFor = (env: ReturnType<typeof setup>, userId = USER_A): Promise<ToolContext> =>
    env.services.profiles.getProfile(userId).then((profile) => ({ userId, profile, services: env.services, now: NOW }));

  it("exposes JSON-schema definitions generated from the Zod schemas", () => {
    const defs = toolDefinitions();
    const create = defs.find((d) => d.function.name === "createTask")!.function.parameters as {
      type: string;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(create.type).toBe("object");
    expect(create.required).toEqual(["title"]);
    expect(Object.keys(create.properties)).toContain("dueDate");
    expect(create).not.toHaveProperty("$schema");
  });

  it("rejects bad arguments, unknown tools and unknown dates without throwing", async () => {
    const env = setup();
    const ctx = await ctxFor(env);
    expect(await executeTool("dropTable", {}, ctx)).toMatchObject({ ok: false, mutated: false });
    expect(await executeTool("createTask", { title: "x", priority: "urgent" }, ctx)).toMatchObject({ ok: false });
    expect(await executeTool("createTask", { title: "Call doctor", dueDate: "someday soon" }, ctx)).toMatchObject({
      ok: false,
      error: 'Couldn\'t understand the date "someday soon"',
    });
    expect(env.store.tasks).toHaveLength(0);
  });

  it("cannot reach another user's task, even with its id", async () => {
    const env = setup();
    const other = await env.services.tasks.createTask(USER_B, { title: "B's private task" });
    if (!other.ok) throw new Error("setup");
    const ctx = await ctxFor(env);
    expect(await executeTool("completeTask", { taskId: other.task.id }, ctx)).toMatchObject({ ok: false, mutated: false });
    expect(await executeTool("updateTask", { taskId: other.task.id, dueDate: "tomorrow" }, ctx)).toMatchObject({ ok: false });
    expect(env.store.tasks[0]).toMatchObject({ status: "open", dueDate: null });
  });

  it("moving a task clears a stale planned day and keeps the title", async () => {
    const env = setup();
    const created = await env.services.tasks.createTask(USER_A, { title: "Renew passport", plannedDate: "2026-09-24" });
    if (!created.ok) throw new Error("setup");
    const r = await executeTool("updateTask", { taskId: created.task.id, dueDate: "Sunday" }, await ctxFor(env));
    expect(r.ok).toBe(true);
    expect(env.store.tasks[0]).toMatchObject({ title: "Renew passport", dueDate: "2026-09-27", plannedDate: null });
  });
});

describe("OpenAI client", () => {
  it("sends the model, tools and key, and parses tool calls", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: null, tool_calls: [call("searchTasks", { date: "tomorrow" })] } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = createOpenAIClient({ apiKey: "sk-test", model: "test-model", fetchImpl });
    const res = await client.complete({ messages: [{ role: "user", content: "hi" }], tools: toolDefinitions() });
    expect(res.toolCalls[0].function.name).toBe("searchTasks");
    expect(sent!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(sent!.init.body as string)).toMatchObject({ model: "test-model", tool_choice: "auto" });
  });

  it("throws a short error on failure without echoing the key", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "Incorrect API key provided: sk-test" } }), {
        status: 401,
      })) as unknown as typeof fetch;
    const client = createOpenAIClient({ apiKey: "sk-test", fetchImpl });
    const error = await client.complete({ messages: [], tools: [] }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as Error).message).toBe("OpenAI returned 401 (invalid_api_key)");
  });
});
