import { describe, expect, it } from "vitest";
import { buildTimeline, computePriorityScore, pickTopTasks } from "@/services/planning-service";
import { freeMinutesInWorkingHours } from "@/services/calendar-service";
import type { CalendarEvent, Task } from "@/types/domain";

const today = "2026-09-23";
const base: Task = {
  id: "x", userId: "u", title: "x", status: "open", priority: "normal", postponeCount: 0,
  source: "dashboard", createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
};
const t = (id: string, patch: Partial<Task>): Task => ({ ...base, id, title: id, ...patch });
const ctx = { today, nextActionIds: new Set<string>() };

describe("priority scoring", () => {
  it("ranks overdue and due-today work above later work", () => {
    const overdue = computePriorityScore(t("a", { dueDate: "2026-09-20" }), ctx);
    const dueToday = computePriorityScore(t("b", { dueDate: today }), ctx);
    const nextWeek = computePriorityScore(t("c", { dueDate: "2026-09-30" }), ctx);
    expect(overdue).toBeGreaterThan(dueToday);
    expect(dueToday).toBeGreaterThan(nextWeek);
  });

  it("stops pushing tasks the user keeps postponing", () => {
    const fresh = computePriorityScore(t("a", { dueDate: today }), ctx);
    const stale = computePriorityScore(t("a", { dueDate: today, postponeCount: 4 }), ctx);
    expect(stale).toBeLessThan(fresh);
  });

  it("picks at most 3, skipping someday, completed and future-planned tasks", () => {
    const tasks = [
      t("due", { dueDate: today }),
      t("overdue", { dueDate: "2026-09-21" }),
      t("high", { priority: "high" }),
      t("planned", { plannedDate: today }),
      t("later", { plannedDate: "2026-09-26", dueDate: today }),
      t("someday", { status: "someday", priority: "high" }),
      t("done", { status: "completed", dueDate: today }),
    ];
    const top = pickTopTasks(tasks, ctx);
    expect(top).toHaveLength(3);
    expect(top.map((x) => x.id)).not.toContain("someday");
    expect(top.map((x) => x.id)).not.toContain("done");
    expect(top.map((x) => x.id)).not.toContain("later");
    expect(top[0].id).toBe("overdue");
  });
});

describe("today timeline and availability", () => {
  const tz = "Asia/Jerusalem";
  const profile = { timezone: tz, workingHoursStart: "09:00", workingHoursEnd: "18:00" };
  // 09:00-09:30 and 14:00-15:00 local (UTC+3)
  const events: CalendarEvent[] = [
    { id: "1", title: "Standup", start: "2026-09-23T06:00:00Z", end: "2026-09-23T06:30:00Z" },
    { id: "2", title: "Review", start: "2026-09-23T11:00:00Z", end: "2026-09-23T12:00:00Z" },
  ];

  it("computes free minutes inside working hours", () => {
    expect(freeMinutesInWorkingHours(events, today, profile)).toBe(9 * 60 - 90);
    expect(freeMinutesInWorkingHours(events, today, profile, "15:00")).toBe(180);
    expect(freeMinutesInWorkingHours(events, today, profile, "19:00")).toBe(0);
  });

  it("merges events and timed tasks and fills free gaps", () => {
    const timeline = buildTimeline(today, events, [t("call", { title: "Call doctor", dueDate: today, dueTime: "11:00", estimatedMinutes: 15 })], profile);
    expect(timeline.map((i) => `${i.start} ${i.kind}`)).toEqual([
      "09:00 event",
      "09:30 free",
      "11:00 task",
      "11:15 free",
      "14:00 event",
      "15:00 free",
    ]);
  });
});
