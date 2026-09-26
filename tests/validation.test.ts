import { describe, expect, it } from "vitest";
import {
  createReminderSchema,
  createTaskSchema,
  updateProfileSchema,
  createWaitingForSchema,
} from "@/lib/validation/schemas";

describe("input validation", () => {
  it("accepts a well-formed task and applies defaults", () => {
    const parsed = createTaskSchema.parse({ title: "Call doctor", estimatedMinutes: 15, context: "phone" });
    expect(parsed).toMatchObject({ status: "open", priority: "normal", source: "dashboard" });
  });

  it("rejects unknown enum values and malformed dates", () => {
    expect(createTaskSchema.safeParse({ title: "x", priority: "urgent" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "x", dueDate: "2026-13-40" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: "x", estimatedMinutes: -5 }).success).toBe(false);
  });

  it("requires person and topic on waiting items", () => {
    expect(createWaitingForSchema.safeParse({ person: "", topic: "x" }).success).toBe(false);
  });

  it("does not allow a reminder to target both a task and a waiting item", () => {
    expect(
      createReminderSchema.safeParse({ taskId: "a", waitingForId: "b", remindAt: "2026-09-24T07:30:00+03:00" }).success,
    ).toBe(false);
    expect(createReminderSchema.safeParse({ taskId: "a", remindAt: "2026-09-24T07:30:00Z" }).success).toBe(true);
  });

  it("validates timezones and phone numbers on the profile", () => {
    expect(updateProfileSchema.safeParse({ timezone: "Asia/Jerusalem" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ phoneNumber: "+972501234567" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ phoneNumber: "0501234567" }).success).toBe(false);
  });
});
