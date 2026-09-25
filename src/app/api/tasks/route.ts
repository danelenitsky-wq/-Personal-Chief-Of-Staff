import { NextResponse, type NextRequest } from "next/server";
import { TASK_VIEWS, type TaskView } from "@/services/task-service";
import type { CreateTaskInput } from "@/lib/validation/schemas";
import { handle, readJson } from "../_lib";

/** GET /api/tasks?view=today  or  ?status=open&projectId=…&q=… */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = params.get("view");
  return handle(({ userId, services }) => {
    if (view) {
      if (!TASK_VIEWS.includes(view as TaskView)) return Promise.resolve([]);
      return services.tasks.getTaskView(userId, view as TaskView);
    }
    const statuses = params.getAll("status");
    return services.tasks.listTasks(userId, {
      status: statuses.length ? (statuses as never) : undefined,
      projectId: params.get("projectId") ?? undefined,
      lifeArea: params.get("lifeArea") ?? undefined,
      query: params.get("q") ?? undefined,
    });
  });
}

/**
 * POST /api/tasks  { ...task, allowDuplicate?: boolean }
 * Returns 409 with the similar tasks when a likely duplicate exists.
 */
export async function POST(request: Request) {
  let conflict: unknown = null;
  const response = await handle(async ({ userId, services }) => {
    const body = (await readJson(request)) as CreateTaskInput & { allowDuplicate?: boolean };
    const { allowDuplicate, ...input } = body ?? {};
    const result = await services.tasks.createTask(userId, { ...input, source: "dashboard" }, { allowDuplicate });
    if (!result.ok) {
      conflict = result.duplicates;
      return null;
    }
    return result.task;
  }, 201);
  if (conflict) return NextResponse.json({ error: "Possible duplicate", duplicates: conflict }, { status: 409 });
  return response;
}
