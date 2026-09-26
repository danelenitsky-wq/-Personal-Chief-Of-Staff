import { describe, expect, it } from "vitest";
import { parseMessage } from "@/lib/ai/rules";
import { chat } from "./ai-helpers";
import { USER_A } from "./helpers";

// NOW is Wednesday 2026-09-23 in Asia/Jerusalem.
const TOMORROW = "2026-09-24";
const FRIDAY = "2026-09-25";
const SUNDAY = "2026-09-27";

describe("rules parser", () => {
  it("recognises the Phase 3 message shapes", () => {
    expect(parseMessage("Call doctor tomorrow.")).toEqual({ kind: "create", items: [{ title: "Call doctor", day: "tomorrow" }] });
    expect(parseMessage("What do I have tomorrow?")).toEqual({ kind: "show", day: "tomorrow" });
    expect(parseMessage("I'm done with the doctor.")).toEqual({ kind: "complete", target: "doctor" });
    expect(parseMessage("Move it to Friday.")).toEqual({ kind: "move", target: "it", day: "friday" });
    expect(parseMessage("2")).toEqual({ kind: "choice", index: 1 });
    expect(parseMessage("add anyway")).toEqual({ kind: "addAnyway" });
  });

  it("splits separate actions but keeps 'bread and milk' together", () => {
    expect(parseMessage("Tomorrow I need to call the doctor and send Ozi the document")).toEqual({
      kind: "create",
      items: [
        { title: "Call the doctor", day: "tomorrow" },
        { title: "Send Ozi the document", day: "tomorrow" },
      ],
    });
    expect(parseMessage("Buy bread and milk")).toEqual({ kind: "create", items: [{ title: "Buy bread and milk", day: null }] });
  });

  it("does not turn an unrecognised question into a task", () => {
    expect(parseMessage("How are you?")).toEqual({ kind: "unknown" });
  });
});

describe("no-key WhatsApp flows", () => {
  it("runs without an OpenAI key", () => {
    expect(chat().mode).toBe("rules");
  });

  it("Call doctor tomorrow → a real task, then shows, completes it", async () => {
    const c = chat();
    expect(await c.say("Call doctor tomorrow.")).toBe("✓ Tomorrow: Call doctor.");
    expect(c.tasks()).toHaveLength(1);
    expect(c.tasks()[0]).toMatchObject({
      title: "Call doctor",
      dueDate: TOMORROW,
      context: "phone",
      estimatedMinutes: 15,
      source: "whatsapp",
      status: "open",
    });

    expect(await c.say("What do I have tomorrow?")).toBe("Tomorrow:\n• Call doctor");
    expect(await c.say("I'm done with the doctor.")).toBe("✓ Marked complete.");
    expect(c.tasks()[0].status).toBe("completed");
    expect(await c.say("What do I have tomorrow?")).toBe("Nothing for tomorrow.");
  });

  it("Move it to Friday moves the task mentioned last", async () => {
    const c = chat();
    await c.say("Call doctor tomorrow.");
    expect(await c.say("Move it to Friday.")).toBe("✓ Moved to Friday.");
    expect(c.tasks()[0].dueDate).toBe(FRIDAY);
  });

  it("stores the detected intent on each inbound message", async () => {
    const c = chat();
    await c.say("Call doctor tomorrow.");
    await c.say("What do I have tomorrow?");
    await c.say("Move it to Friday.");
    await c.say("Done with the doctor");
    expect(c.inbound().map((m) => m.intent)).toEqual(["CREATE_TASK", "SHOW_TASKS", "POSTPONE_TASK", "COMPLETE_TASK"]);
  });

  it("Scenario A: two tasks from one message", async () => {
    const c = chat();
    expect(await c.say("Tomorrow I need to call the doctor and send Ozi the document")).toBe("✓ Added both for tomorrow.");
    expect(c.tasks().map((t) => [t.title, t.dueDate])).toEqual([
      ["Call the doctor", TOMORROW],
      ["Send Ozi the document", TOMORROW],
    ]);
  });

  it("Scenario C: Done with Ozi", async () => {
    const c = chat();
    await c.say("Tomorrow I need to call the doctor and send Ozi the document");
    expect(await c.say("Done with Ozi")).toBe("✓ Marked complete.");
    expect(c.tasks().find((t) => t.title === "Send Ozi the document")!.status).toBe("completed");
    expect(c.tasks().find((t) => t.title === "Call the doctor")!.status).toBe("open");
  });

  it("Scenario E: a move made in the dashboard is what WhatsApp sees", async () => {
    const c = chat();
    await c.say("Book the car service tomorrow");
    const task = c.tasks()[0];
    // The dashboard planner drags it to Sunday (same service the UI calls).
    await c.services.tasks.updateTask(USER_A, task.id, { plannedDate: SUNDAY }, "dashboard");
    expect(await c.say("What do I have Sunday?")).toBe("Sunday:\n• Book the car service");
    expect(await c.say("What do I have tomorrow?")).toBe("Nothing for tomorrow.");
  });

  it("asks which one when several tasks match, then acts on the number", async () => {
    const c = chat();
    const a = await c.services.tasks.createTask(USER_A, { title: "Email Dana the invoice", dueDate: TOMORROW });
    const b = await c.services.tasks.createTask(USER_A, { title: "Email Dana about the offsite", dueDate: FRIDAY }, { allowDuplicate: true });
    expect(a.ok && b.ok).toBe(true);

    expect(await c.say("Done with Dana")).toBe("Which one?\n1. Email Dana the invoice (tomorrow)\n2. Email Dana about the offsite (Friday)");
    expect(c.tasks().every((t) => t.status === "open")).toBe(true);
    expect(await c.say("2")).toBe("✓ Marked complete.");
    expect(c.tasks().find((t) => t.title === "Email Dana about the offsite")!.status).toBe("completed");
    expect(c.tasks().find((t) => t.title === "Email Dana the invoice")!.status).toBe("open");
  });

  it("asks before creating a duplicate, and adds it only when told to", async () => {
    const c = chat();
    await c.say("Call doctor tomorrow");
    const reply = await c.say("Call doctor tomorrow");
    expect(reply).toMatch(/^You already have:\nCall doctor\nNothing new was added/);
    expect(c.tasks()).toHaveLength(1);
    expect(await c.say("add anyway")).toBe("✓ Tomorrow: Call doctor.");
    expect(c.tasks()).toHaveLength(2);
  });

  it("names tasks it skipped as duplicates in a multi-task message", async () => {
    const c = chat();
    await c.services.tasks.createTask(USER_A, { title: "Send Ozi the signed document" });
    expect(await c.say("Tomorrow I need to call the doctor and send Ozi the document")).toBe(
      "✓ Tomorrow: Call the doctor.\nAlready on your list, not added again:\n• Send Ozi the signed document",
    );
    expect(c.tasks()).toHaveLength(2);
  });

  it("asks which one when 'it' could mean several tasks", async () => {
    const c = chat();
    await c.say("Tomorrow I need to call the doctor and send Ozi the document");
    expect(await c.say("Move it to Friday")).toBe("Which one?\n1. Call the doctor (tomorrow)\n2. Send Ozi the document (tomorrow)");
    expect(await c.say("1")).toBe("✓ Moved to Friday.");
    expect(c.tasks().map((t) => t.dueDate)).toEqual([FRIDAY, TOMORROW]);
  });

  it("never claims an action it did not take", async () => {
    const c = chat();
    expect(await c.say("Done with the dentist")).toBe('I couldn\'t find an open task about "dentist".');
    expect(await c.say("Move it to Friday")).toBe("Move which task?");
    expect(await c.say("How are you?")).toMatch(/^I didn't catch that/);
    expect(c.tasks()).toHaveLength(0);
  });

  it("only touches the sender's own tasks", async () => {
    const c = chat();
    await c.services.tasks.createTask("user-b", { title: "Send Ozi the contract" });
    expect(await c.say("Done with Ozi")).toBe('I couldn\'t find an open task about "ozi".');
    expect(c.store.tasks.find((t) => t.userId === "user-b")!.status).toBe("open");
  });
});
