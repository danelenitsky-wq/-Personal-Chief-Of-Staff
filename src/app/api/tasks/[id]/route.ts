import type { UpdateTaskInput } from "@/lib/validation/schemas";
import { handle, readJson } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(({ userId, services }) => services.tasks.getTask(userId, id));
}

/** PATCH /api/tasks/:id  — partial update; { status: "completed" } completes. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async ({ userId, services }) => {
    const body = (await readJson(request)) as UpdateTaskInput;
    if (body?.status === "completed" && Object.keys(body).length === 1) {
      return services.tasks.completeTask(userId, id);
    }
    return services.tasks.updateTask(userId, id, body);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async ({ userId, services }) => {
    await services.tasks.deleteTask(userId, id);
    return undefined;
  });
}
