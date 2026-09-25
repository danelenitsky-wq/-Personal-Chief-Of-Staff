import { describe, expect, it } from "vitest";
import { ValidationError, NotFoundError } from "@/services/errors";
import { isInView } from "@/services/task-service";
import { setup, TODAY, USER_A, USER_B } from "./helpers";

async function create(s: ReturnType<typeof setup>, userId: string, input: Parameters<ReturnType<typeof setup>["services"]["tasks"]["createTask"]>[1]) {
  const result = await s.services.tasks.createTask(userId, input);
  if (!result.ok) throw new Error("unexpected duplicate");
  return result.task;
}

describe("task creation", () => {
  it("creates a task with defaults and records activity", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "  Call the doctor ", dueDate: "2026-09-24" });
    expect(task).toMatchObject({
      userId: USER_A,
      title: "Call the doctor",
      status: "open",
      priority: "normal",
      source: "dashboard",
      postponeCount: 0,
      dueDate: "2026-09-24",
    });
    const activity = await s.services.tasks.getTaskActivity(USER_A, task.id);
    expect(activity.map((a) => a.kind)).toEqual(["created"]);
  });

  it("rejects invalid input before touching the database", async () => {
    const s = setup();
    await expect(s.services.tasks.createTask(USER_A, { title: "   " })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      s.services.tasks.createTask(USER_A, { title: "x", dueDate: "tomorrow" }),
    ).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      s.services.tasks.createTask(USER_A, { title: "x", dueTime: "25:00" }),
    ).rejects.toThrow(/HH:mm/);
    expect(s.store.tasks).toHaveLength(0);
  });

  it("refuses to attach a task to another user's project", async () => {
    const s = setup();
    const project = await s.services.projects.createProject(USER_B, { name: "B's project" });
    await expect(
      s.services.tasks.createTask(USER_A, { title: "Sneaky", projectId: project.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("duplicate detection", () => {
  it("returns likely duplicates instead of silently creating", async () => {
    const s = setup();
    await create(s, USER_A, { title: "Book doctor appointment" });
    const result = await s.services.tasks.createTask(USER_A, { title: "book the doctor" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.duplicates.map((t) => t.title)).toEqual(["Book doctor appointment"]);
    expect(s.store.tasks).toHaveLength(1);
  });

  it("creates anyway when the user confirms", async () => {
    const s = setup();
    await create(s, USER_A, { title: "Book doctor" });
    const result = await s.services.tasks.createTask(USER_A, { title: "Book doctor" }, { allowDuplicate: true });
    expect(result.ok).toBe(true);
    expect(s.store.tasks).toHaveLength(2);
  });

  it("ignores completed tasks, unrelated tasks and other users' tasks", async () => {
    const s = setup();
    const done = await create(s, USER_A, { title: "Call insurance" });
    await s.services.tasks.completeTask(USER_A, done.id);
    await create(s, USER_B, { title: "Pay electricity bill" });
    expect((await s.services.tasks.createTask(USER_A, { title: "Call insurance" })).ok).toBe(true);
    expect((await s.services.tasks.createTask(USER_A, { title: "Pay electricity bill" })).ok).toBe(true);
    expect((await s.services.tasks.createTask(USER_A, { title: "Call doctor" })).ok).toBe(true);
  });
});

describe("task update", () => {
  it("updates fields and counts postponements when a date moves later", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "Call doctor", dueDate: "2026-09-27" });
    const moved = await s.services.tasks.updateTask(USER_A, task.id, { dueDate: "2026-09-28" });
    expect(moved.dueDate).toBe("2026-09-28");
    expect(moved.postponeCount).toBe(1);

    const earlier = await s.services.tasks.updateTask(USER_A, task.id, { dueDate: "2026-09-25", priority: "high" });
    expect(earlier.postponeCount).toBe(1);
    expect(earlier.priority).toBe("high");

    const kinds = (await s.services.tasks.getTaskActivity(USER_A, task.id)).map((a) => a.kind);
    expect(kinds).toContain("postponed");
  });

  it("clears a field when given null", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "Pay bill", dueDate: "2026-09-27" });
    expect((await s.services.tasks.updateTask(USER_A, task.id, { dueDate: null })).dueDate).toBeNull();
  });
});

describe("task completion", () => {
  it("marks complete with a timestamp and is idempotent", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "Send Ozi the document" });
    const done = await s.services.tasks.completeTask(USER_A, task.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe("2026-09-23T07:00:00.000Z");
    s.advance(60_000);
    const again = await s.services.tasks.completeTask(USER_A, task.id);
    expect(again.completedAt).toBe(done.completedAt);

    const reopened = await s.services.tasks.reopenTask(USER_A, task.id);
    expect(reopened).toMatchObject({ status: "open", completedAt: null });
  });

  it("deletes a task", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "Temp" });
    await s.services.tasks.deleteTask(USER_A, task.id);
    await expect(s.services.tasks.getTask(USER_A, task.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("task views", () => {
  it("puts tasks in the right views for the user's today", async () => {
    const s = setup();
    const inbox = await create(s, USER_A, { title: "Inbox item" });
    const today = await create(s, USER_A, { title: "Today item", dueDate: TODAY });
    const planned = await create(s, USER_A, { title: "Planned today", plannedDate: TODAY });
    const overdue = await create(s, USER_A, { title: "Overdue item", dueDate: "2026-09-20" });
    const upcoming = await create(s, USER_A, { title: "Upcoming item", dueDate: "2026-09-30" });
    const someday = await create(s, USER_A, { title: "Someday item", status: "someday" });

    const titles = async (view: Parameters<typeof s.services.tasks.getTaskView>[1]) =>
      (await s.services.tasks.getTaskView(USER_A, view)).map((t) => t.id);

    expect(await titles("inbox")).toEqual([inbox.id]);
    expect(await titles("today")).toEqual(expect.arrayContaining([today.id, planned.id]));
    expect(await titles("overdue")).toEqual([overdue.id]);
    expect(await titles("upcoming")).toEqual([upcoming.id]);
    expect(await titles("someday")).toEqual([someday.id]);

    await s.services.tasks.completeTask(USER_A, overdue.id);
    expect(await titles("overdue")).toEqual([]);
    expect(await titles("completed")).toEqual([overdue.id]);
  });

  it("scenario E: a task moved from Sunday to Monday no longer shows on Sunday", async () => {
    const s = setup();
    const task = await create(s, USER_A, { title: "Call doctor", dueDate: "2026-09-27", source: "whatsapp" });
    await s.services.tasks.updateTask(USER_A, task.id, { dueDate: "2026-09-28" }, "dashboard");
    const sunday = await s.services.tasks.listTasks(USER_A, { dueOnOrAfter: "2026-09-27", dueBefore: "2026-09-28" });
    expect(sunday).toHaveLength(0);
    const fresh = await s.services.tasks.getTask(USER_A, task.id);
    expect(isInView(fresh, "upcoming", TODAY)).toBe(true);
  });
});
