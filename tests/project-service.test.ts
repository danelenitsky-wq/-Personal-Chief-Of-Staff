import { describe, expect, it } from "vitest";
import { needsAttention, resolveNextAction } from "@/services/project-service";
import { setup, USER_A } from "./helpers";

async function task(s: ReturnType<typeof setup>, title: string, projectId?: string) {
  const r = await s.services.tasks.createTask(USER_A, { title, projectId }, { allowDuplicate: true });
  if (!r.ok) throw new Error("unexpected");
  return r.task;
}

describe("project next-action logic", () => {
  it("flags an active project with no Next Action as needing attention", async () => {
    const s = setup();
    const project = await s.services.projects.createProject(USER_A, { name: "New app" });
    const [summary] = await s.services.projects.listProjects(USER_A);
    expect(summary.project.id).toBe(project.id);
    expect(summary.nextAction).toBeNull();
    expect(summary.needsAttention).toBe(true);
  });

  it("does not flag paused or completed projects", async () => {
    const s = setup();
    await s.services.projects.createProject(USER_A, { name: "Paused", status: "paused" });
    const [summary] = await s.services.projects.listProjects(USER_A);
    expect(summary.needsAttention).toBe(false);
  });

  it("promotes the next open task when the Next Action is completed", async () => {
    const s = setup();
    const project = await s.services.projects.createProject(USER_A, { name: "Organize finances" });
    const first = await task(s, "Export bank transactions", project.id);
    s.advance(1000);
    const second = await task(s, "Draft budget", project.id);
    await s.services.projects.setNextAction(USER_A, project.id, first.id);

    await s.services.tasks.completeTask(USER_A, first.id);
    let detail = await s.services.projects.getProjectDetail(USER_A, project.id);
    expect(detail.nextAction?.id).toBe(second.id);
    expect(detail.progress).toBe(50);
    expect(detail.needsAttention).toBe(false);

    await s.services.tasks.completeTask(USER_A, second.id);
    detail = await s.services.projects.getProjectDetail(USER_A, project.id);
    expect(detail.nextAction).toBeNull();
    expect(detail.needsAttention).toBe(true);
    expect(detail.progress).toBe(100);
  });

  it("rejects a Next Action from a different project", async () => {
    const s = setup();
    const a = await s.services.projects.createProject(USER_A, { name: "A" });
    const b = await s.services.projects.createProject(USER_A, { name: "B" });
    const t = await task(s, "Belongs to B", b.id);
    await expect(s.services.projects.setNextAction(USER_A, a.id, t.id)).rejects.toThrow(/Next Action/);
  });

  it("ignores a stale Next Action pointer to a completed task", () => {
    const project = { id: "p", userId: "u", name: "P", status: "active", nextActionTaskId: "t", createdAt: "", updatedAt: "" } as const;
    const done = { id: "t", userId: "u", title: "t", status: "completed", priority: "normal", projectId: "p", postponeCount: 0, source: "dashboard", createdAt: "", updatedAt: "" } as const;
    expect(resolveNextAction(project, [done])).toBeNull();
    expect(needsAttention(project, [done])).toBe(true);
  });

  it("clears the Next Action when its task is deleted", async () => {
    const s = setup();
    const project = await s.services.projects.createProject(USER_A, { name: "P" });
    const t = await task(s, "Only step", project.id);
    await s.services.projects.setNextAction(USER_A, project.id, t.id);
    await s.services.tasks.deleteTask(USER_A, t.id);
    const detail = await s.services.projects.getProjectDetail(USER_A, project.id);
    expect(detail.project.nextActionTaskId).toBeNull();
  });
});
