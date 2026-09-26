"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/lib/container";
import { requireUser } from "@/lib/auth/session";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation/schemas";
import type { Task } from "@/types/domain";
import { run, type ActionResult } from "./result";
import type { CreateTaskResult } from "@/services/task-service";

const refresh = () => revalidatePath("/", "layout");

export async function createTaskAction(
  input: CreateTaskInput,
  allowDuplicate = false,
): Promise<ActionResult<CreateTaskResult>> {
  return run(async () => {
    const user = await requireUser();
    const services = await getServices();
    const result = await services.tasks.createTask(user.id, { ...input, source: "dashboard" }, { allowDuplicate });
    if (result.ok) refresh();
    return result;
  });
}

export async function updateTaskAction(id: string, input: UpdateTaskInput): Promise<ActionResult<Task>> {
  return run(async () => {
    const user = await requireUser();
    const task = await (await getServices()).tasks.updateTask(user.id, id, input, "dashboard");
    refresh();
    return task;
  });
}

export async function setTaskCompletedAction(id: string, completed: boolean): Promise<ActionResult<Task>> {
  return run(async () => {
    const user = await requireUser();
    const { tasks } = await getServices();
    const task = completed ? await tasks.completeTask(user.id, id) : await tasks.reopenTask(user.id, id);
    refresh();
    return task;
  });
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await (await getServices()).tasks.deleteTask(user.id, id);
    refresh();
  });
}

export async function getTaskActivityAction(id: string) {
  return run(async () => {
    const user = await requireUser();
    return (await getServices()).tasks.getTaskActivity(user.id, id);
  });
}

export async function planTaskAction(id: string, day: string | null): Promise<ActionResult<Task>> {
  return run(async () => {
    const user = await requireUser();
    const task = await (await getServices()).planner.planTask(user.id, id, day);
    refresh();
    return task;
  });
}
