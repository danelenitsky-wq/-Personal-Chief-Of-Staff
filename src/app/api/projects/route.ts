import type { CreateProjectInput } from "@/lib/validation/schemas";
import { handle, readJson } from "../_lib";

export async function GET() {
  return handle(({ userId, services }) => services.projects.listProjects(userId));
}

export async function POST(request: Request) {
  return handle(async ({ userId, services }) =>
    services.projects.createProject(userId, (await readJson(request)) as CreateProjectInput), 201);
}
