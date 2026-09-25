"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/lib/container";
import { requireUser } from "@/lib/auth/session";
import type { CreateWaitingForInput } from "@/lib/validation/schemas";
import { run } from "./result";

const refresh = () => revalidatePath("/", "layout");

export async function createWaitingForAction(input: CreateWaitingForInput) {
  return run(async () => {
    const user = await requireUser();
    const item = await (await getServices()).waiting.createWaitingFor(user.id, input);
    refresh();
    return item;
  });
}

export async function markRepliedAction(id: string) {
  return run(async () => {
    const user = await requireUser();
    const item = await (await getServices()).waiting.completeWaitingFor(user.id, id);
    refresh();
    return item;
  });
}

export async function createFollowUpAction(id: string) {
  return run(async () => {
    const user = await requireUser();
    const task = await (await getServices()).waiting.createFollowUpTask(user.id, id);
    refresh();
    return task;
  });
}

export async function remindTomorrowAction(id: string) {
  return run(async () => {
    const user = await requireUser();
    return (await getServices()).waiting.remindTomorrow(user.id, id);
  });
}
