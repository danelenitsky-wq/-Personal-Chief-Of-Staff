"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/lib/container";
import { requireUser } from "@/lib/auth/session";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validation/schemas";
import { run } from "./result";

const refresh = () => revalidatePath("/", "layout");

export async function createProjectAction(input: CreateProjectInput) {
  return run(async () => {
    const user = await requireUser();
    const project = await (await getServices()).projects.createProject(user.id, input);
    refresh();
    return project;
  });
}

export async function updateProjectAction(id: string, input: UpdateProjectInput) {
  return run(async () => {
    const user = await requireUser();
    const project = await (await getServices()).projects.updateProject(user.id, id, input);
    refresh();
    return project;
  });
}

export async function setNextActionAction(projectId: string, taskId: string | null) {
  return run(async () => {
    const user = await requireUser();
    const project = await (await getServices()).projects.setNextAction(user.id, projectId, taskId);
    refresh();
    return project;
  });
}
