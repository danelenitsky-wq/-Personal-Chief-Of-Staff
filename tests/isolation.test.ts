import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/services/errors";
import { setup, USER_A, USER_B } from "./helpers";

describe("user isolation", () => {
  it("never lets one user read or change another user's data", async () => {
    const s = setup();
    const result = await s.services.tasks.createTask(USER_A, { title: "A's private task" });
    if (!result.ok) throw new Error("unexpected");
    const taskId = result.task.id;
    const project = await s.services.projects.createProject(USER_A, { name: "A's project" });
    const waiting = await s.services.waiting.createWaitingFor(USER_A, { person: "Danny", topic: "Contract" });

    expect(await s.services.tasks.listTasks(USER_B)).toEqual([]);
    expect(await s.services.projects.listProjects(USER_B)).toEqual([]);
    expect(await s.services.waiting.listWaiting(USER_B)).toEqual([]);

    await expect(s.services.tasks.getTask(USER_B, taskId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.services.tasks.updateTask(USER_B, taskId, { title: "hacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.services.tasks.completeTask(USER_B, taskId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.services.tasks.deleteTask(USER_B, taskId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.services.projects.getProjectDetail(USER_B, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.services.waiting.completeWaitingFor(USER_B, waiting.id)).rejects.toBeInstanceOf(NotFoundError);

    const untouched = await s.services.tasks.getTask(USER_A, taskId);
    expect(untouched).toMatchObject({ title: "A's private task", status: "open" });
  });

  it("does not let a user point their project's Next Action at someone else's task", async () => {
    const s = setup();
    const foreign = await s.services.tasks.createTask(USER_B, { title: "B's task" });
    if (!foreign.ok) throw new Error("unexpected");
    const project = await s.services.projects.createProject(USER_A, { name: "A's project" });
    await expect(
      s.services.projects.setNextAction(USER_A, project.id, foreign.task.id),
    ).rejects.toThrow(/Next Action/);
  });
});
