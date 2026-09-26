import { describe, expect, it } from "vitest";
import { setup, USER_A } from "./helpers";

describe("waiting for", () => {
  it("completes a waiting item and records when", async () => {
    const s = setup();
    const item = await s.services.waiting.createWaitingFor(USER_A, {
      person: "Danny",
      topic: "Contract reply",
      expectedBy: "2026-09-28",
    });
    const done = await s.services.waiting.completeWaitingFor(USER_A, item.id);
    expect(done).toMatchObject({ status: "completed", completedAt: "2026-09-23T07:00:00.000Z" });
    expect(await s.services.waiting.listWaiting(USER_A)).toEqual([]);
    expect(await s.services.waiting.listWaiting(USER_A, ["completed"])).toHaveLength(1);
  });

  it("sorts overdue items first and computes days waiting", async () => {
    const s = setup(new Date("2026-09-18T07:00:00Z"));
    await s.services.waiting.createWaitingFor(USER_A, { person: "Landlord", topic: "Paint", expectedBy: "2026-09-26" });
    await s.services.waiting.createWaitingFor(USER_A, { person: "Danny", topic: "Contract", expectedBy: "2026-09-21" });
    await s.services.waiting.createWaitingFor(USER_A, { person: "Yael", topic: "Taxes", expectedBy: "2026-09-22" });
    s.advance(5 * 86_400_000); // now 2026-09-23

    const list = await s.services.waiting.listWaiting(USER_A);
    expect(list.map((w) => w.person)).toEqual(["Danny", "Yael", "Landlord"]);
    expect(list[0]).toMatchObject({ overdue: true, daysOverdue: 2, daysWaiting: 5 });
    expect(list[2].overdue).toBe(false);
  });

  it("creates a follow-up task due today and a reminder for tomorrow morning", async () => {
    const s = setup();
    const item = await s.services.waiting.createWaitingFor(USER_A, { person: "Danny", topic: "Contract reply" });
    const task = await s.services.waiting.createFollowUpTask(USER_A, item.id);
    expect(task).toMatchObject({ title: "Follow up with Danny about contract reply", dueDate: "2026-09-23", context: "phone" });

    const reminder = await s.services.waiting.remindTomorrow(USER_A, item.id);
    // 07:30 Jerusalem (UTC+3 in September) on the 24th
    expect(reminder).toMatchObject({ waitingForId: item.id, remindAt: "2026-09-24T04:30:00.000Z", status: "pending" });
  });
});
